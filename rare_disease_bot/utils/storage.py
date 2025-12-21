"""数据存储模块"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from urllib.parse import urlparse
from rich.console import Console

from config.settings import DATA_DIR

console = Console()


class ArticleStorage:
    """文章存储管理器"""
    
    def __init__(self, base_url: str):
        """
        初始化存储
        
        Args:
            base_url: 网站 URL（用于提取域名）
        """
        # 提取域名
        self.domain = self._extract_domain(base_url)
        
        # 创建网站目录
        self.website_dir = DATA_DIR / self.domain
        self.website_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建 Markdown 子目录
        self.md_professional_dir = self.website_dir / "markdown_professional"
        self.md_simplified_dir = self.website_dir / "markdown_simplified"
        self.md_professional_dir.mkdir(exist_ok=True)
        self.md_simplified_dir.mkdir(exist_ok=True)
        
        # 文件路径
        self.articles_file = self.website_dir / "articles.jsonl"
        self.history_file = self.website_dir / "history.txt"
        self.metadata_file = self.website_dir / "metadata.json"
        
        # 加载历史记录
        self.history = self._load_history()
        
        console.log(f"[cyan]📁 存储目录: {self.website_dir}[/cyan]")
        
    def _extract_domain(self, url: str) -> str:
        """提取域名"""
        parsed = urlparse(url)
        domain = parsed.netloc
        # 移除 www.
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
        
    def _load_history(self) -> set:
        """加载已爬取的 URL 历史"""
        if self.history_file.exists():
            with open(self.history_file, 'r', encoding='utf-8') as f:
                return set(line.strip() for line in f if line.strip())
        return set()
        
    def is_scraped(self, url: str) -> bool:
        """检查 URL 是否已爬取"""
        return url in self.history
    
    def _sanitize_filename(self, title: str) -> str:
        """
        将标题转换为安全的文件名
        
        Args:
            title: 文章标题
            
        Returns:
            str: 安全的文件名
        """
        # 移除或替换不安全的字符
        filename = re.sub(r'[<>:"/\\|?*]', '', title)
        # 替换空格为下划线
        filename = filename.replace(' ', '_')
        # 限制长度
        if len(filename) > 100:
            filename = filename[:100]
        return filename
        
    def save_article(self, article: Dict, professional_md: Optional[str] = None, 
                    simplified_md: Optional[str] = None) -> bool:
        """
        保存文章
        
        Args:
            article: 文章数据
            professional_md: 专业版 Markdown 内容
            simplified_md: 小白版 Markdown 内容
            
        Returns:
            bool: 是否成功
        """
        url = article.get('url')
        if not url:
            console.log("[red]✗ 文章缺少 URL[/red]")
            return False
            
        # 检查去重
        if self.is_scraped(url):
            console.log(f"[yellow]⚠️  文章已存在: {url}[/yellow]")
            return False
            
        try:
            # 添加元数据
            article['source_website'] = self.domain
            article['scraped_at'] = datetime.now().isoformat()
            article['content_length'] = len(article.get('content', ''))
            
            # 保存到 JSONL
            with open(self.articles_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(article, ensure_ascii=False) + '\n')
            
            # 保存 Markdown 文件
            if professional_md or simplified_md:
                title = article.get('title', 'Untitled')
                safe_filename = self._sanitize_filename(title)
                date = article.get('date', 'unknown')
                
                # 文件名格式: YYYY-MM-DD_标题.md
                filename = f"{date}_{safe_filename}.md"
                
                if professional_md:
                    prof_path = self.md_professional_dir / filename
                    with open(prof_path, 'w', encoding='utf-8') as f:
                        f.write(professional_md)
                    console.log(f"[green]  ✓ 专业版 MD: {filename}[/green]")
                
                if simplified_md:
                    simp_path = self.md_simplified_dir / filename
                    with open(simp_path, 'w', encoding='utf-8') as f:
                        f.write(simplified_md)
                    console.log(f"[green]  ✓ 小白版 MD: {filename}[/green]")
                
            # 更新历史
            self.history.add(url)
            with open(self.history_file, 'a', encoding='utf-8') as f:
                f.write(url + '\n')
                
            console.log(f"[green]✓ 已保存: {article.get('title', 'Untitled')}[/green]")
            return True
            
        except Exception as e:
            console.log(f"[red]✗ 保存失败: {e}[/red]")
            import traceback
            console.log(f"[red]{traceback.format_exc()}[/red]")
            return False
            
    def save_metadata(self, metadata: Dict):
        """保存元数据"""
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            console.log("[green]✓ 元数据已保存[/green]")
        except Exception as e:
            console.log(f"[red]✗ 元数据保存失败: {e}[/red]")
            
    def get_stats(self) -> Dict:
        """获取统计信息"""
        total_articles = len(self.history)
        
        # 读取文章大小
        total_size = 0
        if self.articles_file.exists():
            total_size = self.articles_file.stat().st_size
            
        return {
            'domain': self.domain,
            'total_articles': total_articles,
            'storage_path': str(self.website_dir),
            'file_size': f"{total_size / 1024:.2f} KB"
        }
        
    def load_articles(self) -> List[Dict]:
        """加载所有文章"""
        articles = []
        if self.articles_file.exists():
            with open(self.articles_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        try:
                            articles.append(json.loads(line))
                        except:
                            pass
        return articles


class BatchArticleSaver:
    """批量文章保存器"""
    
    def __init__(self, storage: ArticleStorage, md_generator=None):
        self.storage = storage
        self.md_generator = md_generator
        self.success_count = 0
        self.fail_count = 0
        self.skipped_count = 0
        
    def save(self, article: Dict) -> bool:
        """保存单篇文章（包括生成 Markdown）"""
        if self.storage.is_scraped(article.get('url', '')):
            self.skipped_count += 1
            return False
        
        # 生成 Markdown 文档
        professional_md = None
        simplified_md = None
        
        if self.md_generator:
            try:
                professional_md, simplified_md = self.md_generator.generate_both_markdowns(article)
            except Exception as e:
                console.log(f"[yellow]⚠️  Markdown 生成失败: {e}[/yellow]")
        
        # 保存文章和 Markdown
        success = self.storage.save_article(article, professional_md, simplified_md)
        if success:
            self.success_count += 1
        else:
            self.fail_count += 1
        return success
        
    def get_summary(self) -> Dict:
        """获取保存摘要"""
        return {
            'success': self.success_count,
            'failed': self.fail_count,
            'skipped': self.skipped_count,
            'total': self.success_count + self.fail_count + self.skipped_count
        }
        
    def print_summary(self):
        """打印摘要"""
        summary = self.get_summary()
        console.print("\n[bold cyan]📊 保存统计[/bold cyan]")
        console.print(f"  成功: [green]{summary['success']}[/green]")
        console.print(f"  失败: [red]{summary['failed']}[/red]")
        console.print(f"  跳过: [yellow]{summary['skipped']}[/yellow]")
        console.print(f"  总计: {summary['total']}")
