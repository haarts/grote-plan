//! Simple login with a session cookie. Users are created through the CLI.

use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Form,
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::{Html, IntoResponse, Redirect, Response},
};
use rand::RngCore;
use serde::Deserialize;

use crate::{AppState, db};

const COOKIE: &str = "gp_session";

#[derive(Clone)]
pub struct User(pub String);

pub fn hash_password(pw: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hash: {e}"))
}

fn verify(pw: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| Argon2::default().verify_password(pw.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

fn token_from(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, _)| *k == COOKIE)
        .map(|(_, v)| v.to_string())
}

pub async fn require_user(State(s): State<AppState>, mut req: Request, next: Next) -> Response {
    let user = token_from(req.headers()).and_then(|t| {
        let c = s.db.lock().unwrap();
        db::session_user(&c, &t).ok().flatten()
    });
    match user {
        Some(name) => {
            req.extensions_mut().insert(User(name));
            next.run(req).await
        }
        None => (StatusCode::UNAUTHORIZED, "not logged in").into_response(),
    }
}

pub async fn login_page(headers: HeaderMap) -> Html<String> {
    Html(page(dutch(&headers), false))
}

/// Language of the login page: the `gp_lang` cookie (set by the language switch in the
/// app), otherwise the browser's preferred language.
fn dutch(headers: &HeaderMap) -> bool {
    let cookie = headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok());
    for c in cookie.flat_map(|v| v.split(';')) {
        if let Some(l) = c.trim().strip_prefix("gp_lang=") {
            return l == "nl";
        }
    }
    let accept = headers.get(header::ACCEPT_LANGUAGE).and_then(|v| v.to_str().ok()).unwrap_or("");
    accept.split(',').next().is_some_and(|l| l.trim().to_ascii_lowercase().starts_with("nl"))
}

#[derive(Deserialize)]
pub struct LoginForm {
    name: String,
    password: String,
}

pub async fn login(State(s): State<AppState>, headers: HeaderMap, Form(f): Form<LoginForm>) -> Response {
    let name = f.name.trim().to_string();
    let found = {
        let c = s.db.lock().unwrap();
        db::user_hash(&c, &name).ok().flatten()
    };
    let ok = match &found {
        Some((_, hash)) => verify(&f.password, hash),
        None => false,
    };
    if !ok {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        return (StatusCode::UNAUTHORIZED, Html(page(dutch(&headers), true))).into_response();
    }
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    {
        let c = s.db.lock().unwrap();
        if let Err(e) = db::create_session(&c, &token, found.unwrap().0) {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }
    let secure = if s.secure_cookies { "; Secure" } else { "" };
    let cookie = format!(
        "{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000{secure}"
    );
    ([(header::SET_COOKIE, cookie)], Redirect::to("/")).into_response()
}

pub async fn logout(State(s): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(t) = token_from(&headers) {
        let c = s.db.lock().unwrap();
        let _ = db::delete_session(&c, &t);
    }
    (
        [(header::SET_COOKIE, format!("{COOKIE}=; Path=/; Max-Age=0"))],
        Redirect::to("/login"),
    )
        .into_response()
}

fn page(nl: bool, failed: bool) -> String {
    let t = |en: &'static str, nl_text: &'static str| if nl { nl_text } else { en };
    let lang = t("en", "nl");
    let title = t("sign in", "inloggen");
    let name = t("Name", "Naam");
    let password = t("Password", "Wachtwoord");
    let submit = t("Sign in", "Inloggen");
    let err = if failed {
        format!("<p class=\"err\">{}</p>", t("Wrong name or password.", "Onjuiste naam of wachtwoord."))
    } else {
        String::new()
    };
    format!(
        r##"<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grote Plan — {title}</title><link rel="icon" href="/icon.svg">
<style>
:root{{--bg:#f4f1ea;--ink:#23211d;--muted:#7a756b;--acc:#c4572e;--card:#fffdf8;--line:#ddd6c8}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);
font:16px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);
background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
background-size:28px 28px}}
form{{background:var(--card);padding:28px;border-radius:14px;width:min(340px,calc(100vw - 32px));
box-shadow:0 10px 40px #0002;display:grid;gap:12px;border:1px solid var(--line)}}
h1{{margin:0 0 4px;font-size:22px;letter-spacing:-.02em}}h1 span{{color:var(--acc)}}
label{{font-size:13px;color:var(--muted);display:grid;gap:4px}}
input{{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff}}
button{{font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:var(--ink);color:#fff;cursor:pointer}}
.err{{color:var(--acc);margin:0;font-size:14px}}
</style></head><body>
<form method="post" action="/login">
<h1>Grote <span>Plan</span></h1>
{err}
<label>{name}<input name="name" autocomplete="username" autocapitalize="none" required autofocus></label>
<label>{password}<input name="password" type="password" autocomplete="current-password" required></label>
<button>{submit}</button>
</form></body></html>"##
    )
}
