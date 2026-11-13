//! Beeldverwerking: PDF van de architect → PNG per pagina, foto's → verkleind + miniatuur.

use std::{io::Cursor, path::Path};

use anyhow::{Context, bail};
use image::{DynamicImage, ImageDecoder, ImageReader, codecs::jpeg::JpegEncoder, imageops::FilterType};

pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub struct Page {
    pub file: String,
    pub width: u32,
    pub height: u32,
}

/// Langste zijde van een gerenderde plattegrond in pixels.
const PLAN_PX: u32 = 4000;

/// Zet een PDF (alle pagina's) om naar PNG's met `pdftoppm` (poppler-utils).
pub fn pdf_to_pages(pdf: &[u8], data_dir: &Path) -> anyhow::Result<Vec<Page>> {
    let tmp = data_dir.join("tmp").join(new_id());
    std::fs::create_dir_all(&tmp)?;
    let result = (|| {
        let input = tmp.join("in.pdf");
        std::fs::write(&input, pdf)?;
        let out = std::process::Command::new("pdftoppm")
            .arg("-png")
            .arg("-scale-to")
            .arg(PLAN_PX.to_string())
            .arg(&input)
            .arg(tmp.join("p"))
            .output()
            .context("pdftoppm niet gevonden — installeer poppler-utils")?;
        if !out.status.success() {
            bail!("PDF omzetten mislukt: {}", String::from_utf8_lossy(&out.stderr));
        }
        let mut pngs: Vec<_> = std::fs::read_dir(&tmp)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|e| e == "png"))
            .collect();
        // p-1.png, p-2.png … of p-01.png: sorteer op paginanummer.
        pngs.sort_by_key(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .and_then(|s| s.rsplit('-').next())
                .and_then(|n| n.parse::<u32>().ok())
                .unwrap_or(0)
        });
        let mut pages = Vec::new();
        for png in pngs {
            let (width, height) = image::image_dimensions(&png)?;
            let file = format!("plan-{}.png", new_id());
            std::fs::rename(&png, data_dir.join("files").join(&file))?;
            pages.push(Page { file, width, height });
        }
        if pages.is_empty() {
            bail!("de PDF bevat geen pagina's");
        }
        Ok(pages)
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    result
}

/// Een plattegrond die als afbeelding (PNG/JPG) is aangeleverd.
pub fn plan_image(bytes: &[u8], data_dir: &Path) -> anyhow::Result<Page> {
    let img = decode(bytes)?;
    let img = if img.width().max(img.height()) > 6000 {
        img.resize(PLAN_PX, PLAN_PX, FilterType::Triangle)
    } else {
        img
    };
    let file = format!("plan-{}.png", new_id());
    img.save(data_dir.join("files").join(&file))?;
    Ok(Page { file, width: img.width(), height: img.height() })
}

pub struct Photo {
    pub file: String,
    pub thumb: String,
    pub orig: String,
    pub width: u32,
    pub height: u32,
}

pub fn photo(bytes: &[u8], original_name: &str, data_dir: &Path) -> anyhow::Result<Photo> {
    let img = decode(bytes)?;
    let id = new_id();
    let files = data_dir.join("files");

    // Extensie volgens het echte formaat (een link zegt niet altijd wat het is).
    let ext = match image::guess_format(bytes) {
        Ok(image::ImageFormat::Png) => "png".to_string(),
        Ok(image::ImageFormat::WebP) => "webp".to_string(),
        Ok(image::ImageFormat::Gif) => "gif".to_string(),
        Ok(image::ImageFormat::Jpeg) => "jpg".to_string(),
        _ => Path::new(original_name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or_else(|| "bin".into()),
    };
    let orig = format!("img-{id}-orig.{ext}");
    std::fs::write(files.join(&orig), bytes)?;

    let large = if img.width().max(img.height()) > 2000 {
        img.resize(2000, 2000, FilterType::Triangle)
    } else {
        img.clone()
    };
    let file = format!("img-{id}.jpg");
    write_jpeg(&large, &files.join(&file), 85)?;

    let thumb_img = img.thumbnail(480, 480);
    let thumb = format!("img-{id}-t.jpg");
    write_jpeg(&thumb_img, &files.join(&thumb), 80)?;

    Ok(Photo { file, thumb, orig, width: large.width(), height: large.height() })
}

fn decode(bytes: &[u8]) -> anyhow::Result<DynamicImage> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    if reader.format().is_none() {
        bail!("onbekend bestandsformaat (gebruik JPG, PNG, WEBP of GIF; HEIC wordt niet ondersteund)");
    }
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder.orientation()?;
    let mut img = DynamicImage::from_decoder(decoder)?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn write_jpeg(img: &DynamicImage, path: &Path, quality: u8) -> anyhow::Result<()> {
    // Transparantie op wit zetten, anders wordt het zwart in JPEG.
    let rgba = img.to_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, p) in rgba.enumerate_pixels() {
        let a = p[3] as u32;
        let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
    }
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality).encode_image(&rgb)?;
    std::fs::write(path, buf)?;
    Ok(())
}
