//! Todos in notes: every line that ends with `#todo`.
//! Done = the text is wrapped in `~~ ~~` (strikethrough in Markdown).
//!
//!   - Order tiles #todo          → open
//!   - ~~Order tiles~~ #todo      → done

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct Todo {
    /// Line number (0-based) in the Markdown text.
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
    // Prefix: indentation, list marker and an optional task-list checkbox.
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

/// All todos in a text (code blocks are skipped).
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

/// Marks the todo on line `line` as done or open. Returns the new text,
/// or `None` if there is no todo on that line.
pub fn set_done(body: &str, line: usize, done: bool) -> Option<String> {
    let lines: Vec<&str> = body.split('\n').collect();
    let raw = *lines.get(line)?;
    let cr = raw.ends_with('\r');
    let p = parse_line(raw.trim_end_matches('\r'))?;
    let mut prefix = p.prefix.to_string();
    // Keep the task-list checkbox in sync, if there is one.
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
    fn finds_todos() {
        let md = "# Kitchen\n- Order tiles #todo\n- ~~Quote~~ #todo\nNot a todo#todo\n```\nx #todo\n```\n1. Pick a tap #TODO  \n#todo";
        let t = extract(md);
        assert_eq!(
            t,
            vec![
                Todo { line: 1, text: "Order tiles".into(), done: false },
                Todo { line: 2, text: "Quote".into(), done: true },
                Todo { line: 7, text: "Pick a tap".into(), done: false },
            ]
        );
    }

    #[test]
    fn check_and_uncheck() {
        let md = "intro\n  - [ ] Order tiles #todo\nend";
        let done = set_done(md, 1, true).unwrap();
        assert_eq!(done, "intro\n  - [x] ~~Order tiles~~ #todo\nend");
        let open = set_done(&done, 1, false).unwrap();
        assert_eq!(open, "intro\n  - [ ] Order tiles #todo\nend");
        assert!(set_done(md, 0, true).is_none());
    }
}
