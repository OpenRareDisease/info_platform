#!/usr/bin/env python3
"""智能新闻爬虫 - 主入口"""
import argparse
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from rich.console import Console
from core.agent import run_crawler_sync

console = Console()


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='智能新闻爬虫 - 自动分析和爬取新闻网站',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基本用法
  python main.py --url https://rarediseases.org/news/
  
  # 限制数量
  python main.py --url https://rarediseases.org/news/ --max-articles 20
  
  # 详细模式
  python main.py --url https://rarediseases.org/news/ --verbose
        """
    )
    
    parser.add_argument(
        '--url',
        type=str,
        required=True,
        help='目标网站 URL（列表页或文章页）'
    )
    
    parser.add_argument(
        '--max-articles',
        type=int,
        default=None,
        help='最大文章数量（默认不限制）'
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='详细输出模式'
    )
    
    args = parser.parse_args()
    
    # 简单打印开始信息
    console.print(f"\n开始爬取: {args.url}")
    if args.max_articles:
        console.print(f"限制数量: {args.max_articles} 篇\n")
    
    try:
        # 运行爬虫
        run_crawler_sync(
            url=args.url,
            max_articles=args.max_articles
        )
        
        console.print("\n完成\n")
        
    except KeyboardInterrupt:
        console.print("\n\n中断")
        sys.exit(1)
        
    except Exception as e:
        console.print(f"\n错误: {e}")
        if args.verbose:
            import traceback
            console.print("\n[red]详细错误信息:[/red]")
            console.print(traceback.format_exc())
        sys.exit(1)


if __name__ == '__main__':
    main()
