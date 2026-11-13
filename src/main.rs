//! Grote Plan — a shared, interactive floor plan for a renovation.
//!
//! One binary: HTTP server (axum) + SQLite storage + image processing.
//! Usage:
//!   grote-plan serve                 start the server (GP_ADDR, GP_DATA, GP_SECURE_COOKIE)
//!   grote-plan user add <name>       add a user / change a password
//!   grote-plan user list             list users
//!   grote-plan user del <name>       delete a user

mod api;
mod auth;
mod db;
mod fetch;
mod media;
mod todo;

use std::{
    io::{IsTerminal, Read},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use tower_http::{
    compression::CompressionLayer, services::ServeDir, set_header::SetResponseHeaderLayer,
};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub data_dir: PathBuf,
    pub events: tokio::sync::broadcast::Sender<String>,
    pub secure_cookies: bool,
}

impl AppState {
    pub fn files_dir(&self) -> PathBuf {
        self.data_dir.join("files")
    }
}

fn data_dir() -> PathBuf {
    PathBuf::from(std::env::var("GP_DATA").unwrap_or_else(|_| "./data".into()))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        [] | ["serve"] => serve().await,
        ["user", "add", name] => user_add(name),
        ["user", "list"] => {
            let conn = db::open(&data_dir())?;
            for n in db::list_users(&conn)? {
                println!("{n}");
            }
            Ok(())
        }
        ["user", "del", name] => {
            let conn = db::open(&data_dir())?;
            db::delete_user(&conn, name)?;
            println!("User '{name}' deleted.");
            Ok(())
        }
        _ => {
            eprintln!(
                "Usage:\n  grote-plan serve\n  grote-plan user add <name>\n  grote-plan user list\n  grote-plan user del <name>\n\nEnvironment: GP_ADDR (0.0.0.0:8080), GP_DATA (./data), GP_SECURE_COOKIE=1 (behind https)"
            );
            std::process::exit(2);
        }
    }
}

fn user_add(name: &str) -> anyhow::Result<()> {
    let conn = db::open(&data_dir())?;
    let pw = if let Ok(pw) = std::env::var("GP_PASSWORD") {
        pw
    } else if std::io::stdin().is_terminal() {
        let a = rpassword::prompt_password("Password: ")?;
        let b = rpassword::prompt_password("Repeat:   ")?;
        anyhow::ensure!(a == b, "passwords do not match");
        a
    } else {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s)?;
        s.trim_end_matches(['\n', '\r']).to_string()
    };
    anyhow::ensure!(pw.len() >= 6, "password must be at least 6 characters");
    db::upsert_user(&conn, name, &auth::hash_password(&pw)?)?;
    println!("User '{name}' saved.");
    Ok(())
}

async fn serve() -> anyhow::Result<()> {
    let data_dir = data_dir();
    std::fs::create_dir_all(data_dir.join("files"))?;
    std::fs::create_dir_all(data_dir.join("tmp"))?;
    let conn = db::open(&data_dir)?;
    if db::list_users(&conn)?.is_empty() {
        eprintln!(
            "⚠  There are no users yet. Create one with:  grote-plan user add <name>"
        );
    }
    let (events, _) = tokio::sync::broadcast::channel(64);
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        data_dir: data_dir.clone(),
        events,
        secure_cookies: std::env::var("GP_SECURE_COOKIE").is_ok_and(|v| v == "1" || v == "true"),
    };

    use api::*;
    let protected = Router::new()
        .route("/api/state", get(get_state))
        .route("/api/events", get(events_stream))
        .route("/api/markdown", post(render_markdown))
        .route("/api/floors", post(upload_floor))
        .route("/api/floors/{id}", patch(update::<db::Floor>).delete(remove::<db::Floor>))
        .route("/api/rooms", post(create::<db::Room>))
        .route("/api/rooms/{id}", patch(update::<db::Room>).delete(remove::<db::Room>))
        .route("/api/zones", post(create::<db::Zone>))
        .route("/api/zones/{id}", patch(update::<db::Zone>).delete(remove::<db::Zone>))
        .route("/api/notes", post(create::<db::Note>))
        .route("/api/notes/{id}", patch(update::<db::Note>).delete(remove::<db::Note>))
        .route("/api/notes/{id}/images", post(upload_images))
        .route("/api/notes/{id}/images/url", post(image_from_url))
        .route("/api/notes/{id}/todo", post(toggle_todo))
        .route("/api/images/{id}", delete(remove::<db::Image>))
        .route("/api/markers", post(create::<db::Marker>))
        .route("/api/markers/{id}", patch(update::<db::Marker>).delete(remove::<db::Marker>))
        .merge(
            Router::new()
                .nest_service("/files", ServeDir::new(data_dir.join("files")))
                .layer(SetResponseHeaderLayer::overriding(
                    header::CACHE_CONTROL,
                    HeaderValue::from_static("private, max-age=31536000, immutable"),
                )),
        )
        .route_layer(middleware::from_fn_with_state(state.clone(), auth::require_user))
        .layer(DefaultBodyLimit::max(200 * 1024 * 1024));

    let app = Router::new()
        .route("/", get(page_index))
        .route("/login", get(auth::login_page).post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/app.js", get(|| asset("app.js", include_str!("../static/app.js"), "text/javascript; charset=utf-8")))
        .route("/app.css", get(|| asset("app.css", include_str!("../static/app.css"), "text/css; charset=utf-8")))
        .route("/icon.svg", get(|| asset("icon.svg", include_str!("../static/icon.svg"), "image/svg+xml")))
        .route("/privacy", get(|| asset("privacy.html", include_str!("../static/privacy.html"), "text/html; charset=utf-8")))
        .route(
            "/icon-512.png",
            get(|| async {
                ([(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "max-age=86400")], &include_bytes!("../static/icon-512.png")[..])
            }),
        )
        .route(
            "/manifest.webmanifest",
            get(|| asset("manifest.webmanifest", include_str!("../static/manifest.webmanifest"), "application/manifest+json")),
        )
        .merge(protected)
        .layer(CompressionLayer::new())
        .with_state(state);

    let addr = std::env::var("GP_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("Grote Plan running on http://{addr}  (data: {})", data_dir.display());
    axum::serve(listener, app).await?;
    Ok(())
}

/// Static files are embedded in the binary. With GP_STATIC_DIR they are read from
/// disk during development, so you don't have to recompile.
async fn asset(name: &str, embedded: &'static str, ctype: &'static str) -> Response {
    let body = match std::env::var("GP_STATIC_DIR") {
        Ok(dir) => tokio::fs::read_to_string(PathBuf::from(dir).join(name))
            .await
            .unwrap_or_else(|_| embedded.to_string()),
        Err(_) => embedded.to_string(),
    };
    ([(header::CONTENT_TYPE, ctype), (header::CACHE_CONTROL, "no-cache")], body).into_response()
}

async fn page_index() -> Response {
    asset("index.html", include_str!("../static/index.html"), "text/html; charset=utf-8").await
}
