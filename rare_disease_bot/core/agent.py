"""LangChain Agent - 智能爬虫决策引擎"""
import asyncio
from typing import List, Dict, Optional
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.tools import Tool
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from config.settings import (
    OPENAI_API_BASE,
    OPENAI_API_KEY,
    MODEL_NAME,
    LLM_TEMPERATURE
)
from core.browser_tools import BrowserManager
from core.explorer import WebsiteExplorer
from core.extractor import ArticleExtractor
from core.markdown_generator import MarkdownGenerator
from utils.storage import ArticleStorage, BatchArticleSaver

console = Console()


class NewsCrawlerAgent:
    """智能罕见病新闻爬虫 Agent"""
    
    def __init__(self, base_url: str, max_articles: Optional[int] = None):
        """
        初始化 Agent
        
        Args:
            base_url: 起始 URL
            max_articles: 最大文章数量（None 表示不限制）
        """
        self.base_url = base_url
        self.max_articles = max_articles
        
        # 初始化组件
        self.browser = None
        self.explorer = WebsiteExplorer()
        self.extractor = ArticleExtractor()
        self.md_generator = MarkdownGenerator()
        self.storage = ArticleStorage(base_url)
        self.saver = BatchArticleSaver(self.storage, self.md_generator)
        
        # 状态
        self.page_structure = None
        self.article_urls = []
        self.current_step = ""
        
    async def run(self):
        """运行爬虫"""
        pass  # 开始信息在 main.py 已经打印了
        
        async with BrowserManager() as browser:
            self.browser = browser
            
            # 阶段 1: 探索网站结构
            await self._explore_phase()
            
            # 阶段 2: 收集文章链接
            await self._collect_links_phase()
            
            # 阶段 3: 提取文章内容
            await self._extract_phase()
            
            # 阶段 4: 总结
            self._summary_phase()
            
    async def _explore_phase(self):
        """阶段 1: 探索网站结构"""
        console.print("分析页面结构...")
        
        success = await self.browser.navigate(self.base_url)
        if not success:
            raise Exception("无法访问目标网站")
            
        html = await self.browser.get_html(max_length=30000)
        self.page_structure = self.explorer.analyze_page_structure(
            self.base_url, html
        )
        
    async def _collect_links_phase(self):
        """阶段 2: 收集文章链接"""
        console.print("收集链接...")
        
        page_type = self.page_structure.get('page_type')
        
        if page_type == 'single_article':
            self.article_urls = [self.base_url]
        else:
            await self._collect_from_list()
            
        console.print(f"找到 {len(self.article_urls)} 篇文章\n")
        
    async def _collect_from_list(self):
        """从列表页收集链接"""
        selectors = self.page_structure.get('selectors', {})
        link_selector = selectors.get('article_links', 'article a')
        
        has_pagination = self.page_structure.get('pagination', {}).get('has_pagination', False)
        
        if has_pagination and self.max_articles and self.max_articles > 10:
            # 需要访问多页
            await self._collect_with_pagination(link_selector)
        else:
            # 只从当前页收集
            urls = await self.browser.get_links(link_selector)
            self.article_urls.extend(urls)
            
        # 去重
        self.article_urls = list(dict.fromkeys(self.article_urls))
        
        # 应用数量限制
        if self.max_articles:
            self.article_urls = self.article_urls[:self.max_articles]
            
    async def _collect_with_pagination(self, link_selector: str):
        """从多页收集链接"""
        max_pages = 10
        
        if self.max_articles:
            articles_per_page = self.page_structure.get('article_count', 10)
            max_pages = min(max_pages, (self.max_articles // articles_per_page) + 1)
        
        for page_num in range(1, max_pages + 1):
            urls = await self.browser.get_links(link_selector)
            self.article_urls.extend(urls)
            
            if self.max_articles and len(self.article_urls) >= self.max_articles:
                break
                
            if page_num < max_pages:
                next_url = self._construct_next_page_url(page_num + 1)
                if next_url:
                    await self.browser.navigate(next_url)
                else:
                    break
                    
    def _construct_next_page_url(self, page_num: int) -> Optional[str]:
        """构造下一页 URL"""
        # 简单的分页 URL 模式
        # 例如: /news/ -> /news/page/2/
        # 或: /news/?page=2
        
        base = self.base_url.rstrip('/')
        
        # 模式 1: /page/N/
        if '/page/' not in base:
            return f"{base}/page/{page_num}/"
            
        # 模式 2: 替换页码
        import re
        if match := re.search(r'/page/(\d+)', base):
            return re.sub(r'/page/\d+', f'/page/{page_num}', base)
            
        return None
        
    async def _extract_phase(self):
        """阶段 3: 提取文章内容"""
        console.print("开始提取...\n")
        
        total = len(self.article_urls)
        
        for i, url in enumerate(self.article_urls, 1):
            if self.storage.is_scraped(url):
                console.print(f"[{i}/{total}] 跳过（已存在）")
                continue
                
            success = await self.browser.navigate(url)
            if not success:
                console.print(f"[{i}/{total}] 失败: 无法访问")
                continue
                
            html = await self.browser.get_html()
            article = self.extractor.extract_article(url, html)
            
            if article:
                if self.saver.save(article):
                    title = article['title'][:50]
                    console.print(f"[{i}/{total}] {title}")
            else:
                console.print(f"[{i}/{total}] 失败: 提取错误")
        
    def _summary_phase(self):
        """阶段 4: 总结"""
        console.print()
        self.saver.print_summary()
        
        stats = self.storage.get_stats()
        console.print(f"\n保存位置: {stats['storage_path']}")
        console.print(f"文件大小: {stats['file_size']}")


async def run_crawler(url: str, max_articles: Optional[int] = None):
    """
    运行爬虫（异步）
    
    Args:
        url: 起始 URL
        max_articles: 最大文章数量
    """
    agent = NewsCrawlerAgent(url, max_articles)
    await agent.run()


def run_crawler_sync(url: str, max_articles: Optional[int] = None):
    """
    运行爬虫（同步）
    
    Args:
        url: 起始 URL
        max_articles: 最大文章数量
    """
    asyncio.run(run_crawler(url, max_articles))
