"""Export articles to server directory with timestamp and clear source."""
from pathlib import Path
from datetime import datetime
import shutil
from typing import Optional

from rich.console import Console
from config.settings import DATA_DIR, PROJECT_ROOT

console = Console()


def export_articles_to_server(timestamp: Optional[str] = None) -> Optional[Path]:
    """Move all contents under DATA_DIR to server/articles/<timestamp> and clear source.

    Args:
        timestamp: Optional timestamp string (YYYYMMDDHHMM). If not provided, current time is used.

    Returns:
        Path: The destination directory path.
    """
    ts = timestamp or datetime.now().strftime("%Y%m%d%H%M")
    dest_root = PROJECT_ROOT.parent / "server" / "articles" / ts
    dest_root.mkdir(parents=True, exist_ok=True)

    if not DATA_DIR.exists():
        console.log(f"[yellow]⚠️  源目录不存在: {DATA_DIR}[/yellow]")
        return None

    # 仅当存在新的 Markdown 文件时才搬运
    try:
        has_md = any(DATA_DIR.rglob("*.md"))
    except Exception:
        has_md = False
    if not has_md:
        console.log(f"[cyan]ℹ️ 没有新的 Markdown 文件，跳过导出[/cyan]")
        return None

    moved_count = 0
    for item in DATA_DIR.iterdir():
        try:
            # Skip empty markers or hidden files
            if item.name.startswith("."):
                continue
            target = dest_root / item.name
            shutil.move(str(item), str(target))
            moved_count += 1
        except Exception as e:
            console.log(f"[yellow]⚠️  移动失败 {item.name}: {e}[/yellow]")

    # Recreate source directory as empty
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        console.log(f"[yellow]⚠️  重建源目录失败: {e}[/yellow]")

    console.log(f"[green]✓ 已导出 {moved_count} 项到: {dest_root}[/green]")
    return dest_root
