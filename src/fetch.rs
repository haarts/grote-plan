//! Plaatjes ophalen via een URL. De server downloadt het bestand en bewaart het
//! lokaal, net als een upload.
//!
//! Omdat de server zelf het verzoek doet, mag een URL nooit naar het eigen netwerk
//! wijzen (localhost, 10.x, 192.168.x, …). Elke stap — ook na een redirect — wordt
//! daarom eerst zelf opgezocht en gecontroleerd, en de verbinding wordt vastgepind
//! op precies dat gecontroleerde adres (geen tweede DNS-lookup door de client).

use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};

use anyhow::{Context, bail};
use reqwest::{Url, redirect::Policy};

const MAX_BYTES: usize = 25 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str = "Mozilla/5.0 (compatible; GrotePlan/1.0; +renovatie-plattegrond)";

pub struct Fetched {
    pub bytes: Vec<u8>,
    /// Bestandsnaam afgeleid uit de URL.
    pub name: String,
    /// De URL waar het plaatje uiteindelijk vandaan kwam.
    pub url: String,
}

/// Haalt een plaatje op. Is de URL een webpagina, dan wordt de voorbeeldafbeelding
/// (`og:image` / `twitter:image`) van die pagina genomen.
pub async fn image(raw: &str) -> anyhow::Result<Fetched> {
    let url = Url::parse(raw.trim()).context("dat is geen geldige link")?;
    let (bytes, ctype, url) = get(url).await?;
    let (bytes, url) = if is_html(&ctype, &bytes) {
        if is_pinterest(&url) && !url.path().starts_with("/pin/") {
            bail!("{PINTEREST_HINT}");
        }
        let page = String::from_utf8_lossy(&bytes);
        let img = preview_image(&page).context(
            "deze link is een webpagina zonder voorbeeldafbeelding — gebruik de link van het plaatje zelf \
             (rechtsklik op het plaatje → afbeeldingsadres kopiëren)",
        )?;
        let img_url = url.join(&img).context("ongeldige afbeeldingslink op de pagina")?;
        // Het algemene deelplaatje (logo) van Pinterest is nooit wat je bedoelt.
        if is_pinterest(&url) && img_url.host_str() != Some("i.pinimg.com") {
            bail!("{PINTEREST_HINT}");
        }
        let (bytes, ctype, url) = get(img_url).await?;
        if is_html(&ctype, &bytes) {
            bail!("de voorbeeldafbeelding van de pagina is geen plaatje");
        }
        (bytes, url)
    } else {
        (bytes, url)
    };
    let name = url
        .path_segments()
        .and_then(|mut s| s.next_back().map(str::to_string))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "afbeelding".into());
    Ok(Fetched { bytes, name, url: url.to_string() })
}

/// GET met handmatige redirects; elke hop wordt opnieuw gecontroleerd.
async fn get(mut url: Url) -> anyhow::Result<(Vec<u8>, String, Url)> {
    for _ in 0..=MAX_REDIRECTS {
        let addrs = public_addrs(&url).await?;
        let host = url.host_str().unwrap_or_default().to_string();
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .resolve_to_addrs(&host, &addrs)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .user_agent(USER_AGENT)
            .build()?;
        let mut resp = client
            .get(url.clone())
            .header("accept", "image/avif,image/webp,image/*,text/html;q=0.8,*/*;q=0.5")
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("ophalen mislukt: {}", short(&e)))?;
        if resp.status().is_redirection() {
            let loc = resp
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .context("redirect zonder adres")?;
            url = url.join(loc).context("ongeldige redirect")?;
            continue;
        }
        if !resp.status().is_success() {
            bail!("de site gaf {} terug", resp.status());
        }
        if resp.content_length().is_some_and(|n| n as usize > MAX_BYTES) {
            bail!("bestand is groter dan {} MB", MAX_BYTES / 1024 / 1024);
        }
        let ctype = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mut bytes = Vec::new();
        while let Some(chunk) =
            resp.chunk().await.map_err(|e| anyhow::anyhow!("ophalen mislukt: {}", short(&e)))?
        {
            bytes.extend_from_slice(&chunk);
            if bytes.len() > MAX_BYTES {
                bail!("bestand is groter dan {} MB", MAX_BYTES / 1024 / 1024);
            }
        }
        return Ok((bytes, ctype, url));
    }
    bail!("te veel redirects")
}

const PINTEREST_HINT: &str = "Pinterest geeft het plaatje van deze pin niet vrij aan andere sites. \
    Open de pin in de browser, houd het plaatje ingedrukt en kies 'Afbeeldingslink kopiëren' \
    (een link naar i.pinimg.com) — of sla het plaatje op en kies 📷 Foto's.";

fn is_pinterest(url: &Url) -> bool {
    url.host_str().is_some_and(|h| {
        let h = h.trim_start_matches("www.");
        h.starts_with("pinterest.") || h.contains(".pinterest.") || h == "pin.it"
    })
}

fn short(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "de site reageert niet".into()
    } else if e.is_connect() {
        "kan geen verbinding maken".into()
    } else {
        e.to_string()
    }
}

/// Zoekt de host op; alleen als álle adressen publiek zijn komen ze terug,
/// IPv4 eerst (een Docker-netwerk heeft vaak geen IPv6).
async fn public_addrs(url: &Url) -> anyhow::Result<Vec<SocketAddr>> {
    if !matches!(url.scheme(), "http" | "https") {
        bail!("alleen http- en https-links worden ondersteund");
    }
    let host = url.host_str().context("link zonder host")?;
    let port = url.port_or_known_default().unwrap_or(443);
    let host_for_lookup = host.trim_start_matches('[').trim_end_matches(']');
    let mut addrs: Vec<SocketAddr> = tokio::net::lookup_host((host_for_lookup, port))
        .await
        .with_context(|| format!("host '{host}' niet gevonden"))?
        .collect();
    if addrs.is_empty() {
        bail!("host '{host}' niet gevonden");
    }
    if let Some(bad) = addrs.iter().find(|a| !is_public(a.ip())) {
        bail!("links naar het eigen of een lokaal netwerk zijn niet toegestaan ({})", bad.ip());
    }
    addrs.sort_by_key(|a| a.is_ipv6());
    Ok(addrs)
}

pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
                || o[0] == 0
                || (o[0] == 100 && (o[1] & 0xc0) == 64) // CGNAT 100.64/10
                || (o[0] == 198 && (o[1] & 0xfe) == 18) // benchmark 198.18/15
                || o[0] >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let s0 = v6.segments()[0];
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (s0 & 0xfe00) == 0xfc00 // unique local
                || (s0 & 0xffc0) == 0xfe80) // link local
        }
    }
}

fn is_html(ctype: &str, bytes: &[u8]) -> bool {
    if ctype.starts_with("text/html") || ctype.starts_with("application/xhtml") {
        return true;
    }
    if ctype.starts_with("image/") {
        return false;
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    head.trim_start().starts_with("<!doctype html") || head.contains("<html")
}

/// Voorbeeldafbeelding uit de `<meta>`-tags van een pagina.
fn preview_image(html: &str) -> Option<String> {
    const KEYS: [&str; 5] =
        ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"];
    let lower = html.to_ascii_lowercase();
    let mut found: Vec<(usize, String)> = Vec::new();
    let mut pos = 0;
    while let Some(i) = lower[pos..].find("<meta") {
        let start = pos + i;
        let end = lower[start..].find('>').map(|e| start + e).unwrap_or(lower.len());
        let tag = &html[start..end];
        let key = attr(tag, "property").or_else(|| attr(tag, "name")).map(|k| k.to_ascii_lowercase());
        if let (Some(k), Some(content)) = (key, attr(tag, "content")) {
            if let Some(rank) = KEYS.iter().position(|x| *x == k) {
                if !content.trim().is_empty() {
                    found.push((rank, content.trim().replace("&amp;", "&")));
                }
            }
        }
        pos = end;
    }
    // og:image boven twitter:image; bij gelijke soort de eerste op de pagina.
    found.sort_by_key(|(rank, _)| if *rank <= 2 { 0 } else { 1 });
    found.into_iter().map(|(_, u)| u).next()
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find(name) {
        let at = from + i;
        from = at + name.len();
        // Moet een los attribuut zijn: ervoor witruimte, erna (spaties) '='.
        if at == 0 || !lower.as_bytes()[at - 1].is_ascii_whitespace() {
            continue;
        }
        let rest = tag[from..].trim_start();
        let Some(rest) = rest.strip_prefix('=') else { continue };
        let rest = rest.trim_start();
        let (q, body) = match rest.chars().next() {
            Some(c @ ('"' | '\'')) => (Some(c), &rest[1..]),
            _ => (None, rest),
        };
        let val = match q {
            Some(c) => body.split(c).next().unwrap_or(""),
            None => body.split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or(""),
        };
        return Some(val.to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privé_adressen_geweigerd() {
        for ip in ["127.0.0.1", "10.1.2.3", "192.168.1.10", "172.16.0.1", "169.254.169.254", "100.64.0.1",
                   "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} zou geweigerd moeten worden");
        }
        for ip in ["93.184.216.34", "2606:4700::1111", "8.8.8.8"] {
            assert!(is_public(ip.parse().unwrap()), "{ip} is publiek");
        }
    }

    #[test]
    fn voorbeeldafbeelding_uit_pagina() {
        let html = r#"<html><head>
            <meta name="twitter:image" content="https://x.test/tw.jpg">
            <META content='https://x.test/a.jpg?w=1&amp;h=2' property='og:image' />
            </head></html>"#;
        assert_eq!(preview_image(html).as_deref(), Some("https://x.test/a.jpg?w=1&h=2"));
        assert_eq!(preview_image("<meta name=description content=x>"), None);
    }

    #[test]
    fn pinterest_herkend() {
        for u in ["https://www.pinterest.com/?show_error=true", "https://nl.pinterest.com/pin/1/", "https://pinterest.nl/x"] {
            assert!(is_pinterest(&Url::parse(u).unwrap()), "{u}");
        }
        assert!(!is_pinterest(&Url::parse("https://i.pinimg.com/originals/a.jpg").unwrap()));
    }

    /// Online: `cargo test pinterest_deellink -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn pinterest_deellink() {
        let e = image("https://pin.it/6Oe2dlws9").await.err().expect("moet een melding geven").to_string();
        assert!(e.contains("Pinterest"), "{e}");
    }

    #[tokio::test]
    async fn lokale_links_geweigerd() {
        for u in ["http://127.0.0.1:8080/", "http://localhost/x.png", "file:///etc/passwd", "http://[::1]/"] {
            let e = image(u).await.err().expect(u).to_string();
            assert!(e.contains("niet toegestaan") || e.contains("alleen http"), "{u}: {e}");
        }
    }
}
