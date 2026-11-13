//! Todo's in aantekeningen: elke regel die eindigt op `#todo`.
//! Afgestreept = de tekst staat tussen `~~ ~~` (doorgehaald in Markdown).
//!
//!   - Tegels bestellen #todo          → open
//!   - ~~Tegels bestellen~~ #todo      → afgestreept

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct Todo {
    /// Regelnummer (0-based) in de Markdown-tekst.
    pub line: usize,
    pub text: String,
    pub done: bool,
}

struct Parsed<'a> {
    prefix: &'a str,
    text: &'a str,
    done: bool,
}

const TAG: &str = "#todo";

fn parse_line(line: &str) -> Option<Parsed<'_>> {
    let trimmed = line.trim_end();
    if trimmed.len() < TAG.len() {
        return None;
    }
    let (head, tag) = trimmed.split_at(trimmed.len() - TAG.len());
    if !tag.eq_ignore_ascii_case(TAG) || !(head.is_empty() || head.ends_with(char::is_whitespace)) {
        return None;
    }
    // Voorvoegsel: inspringing, lijstteken en eventueel een takenlijst-vakje.
    let bytes = head.as_bytes();
    let mut i = 0;
    while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\t') {
        i += 1;
    }
    if i < bytes.len() && matches!(bytes[i], b'-' | b'*' | b'+') && bytes.get(i + 1) == Some(&b' ') {
        i += 2;
    } else {
        let mut j = i;
        while j < bytes.len() && bytes[j].is_ascii_digit() {
            j += 1;
        }
        if j > i && matches!(bytes.get(j), Some(b'.') | Some(b')')) && bytes.get(j + 1) == Some(&b' ') {
            i = j + 2;
        }
    }
    if head[i..].starts_with("[ ] ") || head[i..].starts_with("[x] ") || head[i..].starts_with("[X] ") {
        i += 4;
    }
    let content = head[i..].trim();
    let (text, done) = match content.strip_prefix("~~").and_then(|c| c.strip_suffix("~~")) {
        Some(inner) if !inner.is_empty() => (inner.trim(), true),
        _ => (content, false),
    };
    if text.is_empty() {
        return None;
    }
    Some(Parsed { prefix: &head[..i], text, done })
}

/// Alle todo's in een tekst (code-blokken worden overgeslagen).
pub fn extract(body: &str) -> Vec<Todo> {
    let mut out = Vec::new();
    let mut in_code = false;
    for (n, line) in body.lines().enumerate() {
        if line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        if let Some(p) = parse_line(line) {
            out.push(Todo { line: n, text: p.text.to_string(), done: p.done });
        }
    }
    out
}

/// Zet todo op regel `line` op afgestreept of open. Geeft de nieuwe tekst terug,
/// of `None` als op die regel geen todo staat.
pub fn set_done(body: &str, line: usize, done: bool) -> Option<String> {
    let lines: Vec<&str> = body.split('\n').collect();
    let raw = *lines.get(line)?;
    let cr = raw.ends_with('\r');
    let p = parse_line(raw.trim_end_matches('\r'))?;
    let mut prefix = p.prefix.to_string();
    // Takenlijst-vakje meebewegen, als dat er staat.
    if done {
        prefix = prefix.replacen("[ ] ", "[x] ", 1);
    } else {
        prefix = prefix.replacen("[x] ", "[ ] ", 1).replacen("[X] ", "[ ] ", 1);
    }
    let text = if done { format!("~~{}~~", p.text) } else { p.text.to_string() };
    let new_line = format!("{prefix}{text} {TAG}{}", if cr { "\r" } else { "" });
    let mut out: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
    out[line] = new_line;
    Some(out.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vindt_todos() {
        let md = "# Keuken\n- Tegels bestellen #todo\n- ~~Offerte~~ #todo\nGeen todo#todo\n```\nx #todo\n```\n1. Kraan kiezen #TODO  \n#todo";
        let t = extract(md);
        assert_eq!(
            t,
            vec![
                Todo { line: 1, text: "Tegels bestellen".into(), done: false },
                Todo { line: 2, text: "Offerte".into(), done: true },
                Todo { line: 7, text: "Kraan kiezen".into(), done: false },
            ]
        );
    }

    #[test]
    fn afstrepen_en_terug() {
        let md = "intro\n  - [ ] Tegels bestellen #todo\nslot";
        let done = set_done(md, 1, true).unwrap();
        assert_eq!(done, "intro\n  - [x] ~~Tegels bestellen~~ #todo\nslot");
        let open = set_done(&done, 1, false).unwrap();
        assert_eq!(open, "intro\n  - [ ] Tegels bestellen #todo\nslot");
        assert!(set_done(md, 0, true).is_none());
    }
}
