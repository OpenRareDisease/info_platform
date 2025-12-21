"""内容提取器 - 混合策略：BeautifulSoup 提取正文 + LLM 提取元数据"""
import json
from typing import Dict, Optional
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from rich.console import Console
from bs4 import BeautifulSoup

from config.settings import (
    OPENAI_API_BASE,
    OPENAI_API_KEY,
    MODEL_NAME,
    LLM_TEMPERATURE
)
from utils.helpers import truncate_text, validate_article

console = Console()


class ArticleExtractor:
    """文章内容提取器"""
    
    def __init__(self):
        """初始化提取器"""
        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=MODEL_NAME,
            openai_api_base=OPENAI_API_BASE,
            openai_api_key=OPENAI_API_KEY,
            temperature=LLM_TEMPERATURE
        )
        
        # 元数据提取提示词（只提取元数据，不提取正文）
        self.metadata_extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个专业的网页元数据提取专家。你的任务是从 HTML 中提取文章的元数据信息。

**注意**：你只需要提取元数据，正文内容会由其他系统处理。

请从以下 HTML 中提取：

1. **title** (string): 文章标题（从 <title> 或 <h1> 等标签提取）
2. **date** (string): 发布日期（ISO 格式: YYYY-MM-DD，如 "2025-12-08"）
3. **author** (string|null): 作者名（如果没有就返回 null）
4. **categories** (array): 分类/标签列表（如 ["Press Releases", "News"]）

**输出格式（JSON）**：
```json
{{
  "title": "文章标题",
  "date": "2025-12-08",
  "author": "作者名",
  "categories": ["分类1", "分类2"]
}}
```

**注意**：
- 如果某个字段找不到，用 null 或空数组
- 日期尽量转换为 YYYY-MM-DD 格式
- 标题要去除网站名称等后缀

只返回 JSON，不要其他解释。"""),
            ("user", "URL: {url}\n\nHTML（前30000字符）:\n{html}")
        ])
        
    def _extract_content_with_beautifulsoup(self, html: str) -> str:
        """
        使用 BeautifulSoup 提取正文内容
        
        Args:
            html: HTML 内容
            
        Returns:
            str: 正文内容
        """
        soup = BeautifulSoup(html, 'lxml')
        
        # 移除不需要的标签（在查找正文之前）
        for tag in soup.select('script, style, nav, header, footer, aside, iframe, noscript, .sidebar, .navigation, .menu, .comments'):
            tag.decompose()
        
        # 按优先级尝试不同的选择器
        content_selectors = [
            'article .entry-content',
            '.entry-content',
            'article .post-content',
            '.post-content',
            'article .article-content',
            '.article-content',
            'article',  # article 标签本身通常就是正文
            '.content',
            'main article',
            'main',
        ]
        
        content_elem = None
        for selector in content_selectors:
            try:
                elem = soup.select_one(selector)
                if elem:
                    # 在选中的元素内再次移除不需要的标签
                    for unwanted in elem.select('.related, .share, .social, .advertisement, .ad, .author-box, .tags'):
                        unwanted.decompose()
                    
                    # 检查内容长度是否合理
                    text = elem.get_text(strip=True, separator='\n')
                    if len(text) > 200:  # 至少200字符才认为是正文
                        content_elem = elem
                        console.log(f"[cyan]    使用选择器: {selector}, 长度: {len(text)}[/cyan]")
                        break
            except Exception as e:
                console.log(f"[yellow]    选择器 {selector} 错误: {e}[/yellow]")
                continue
        
        # 如果找不到，回退到 body
        if not content_elem:
            console.log("[yellow]    未找到合适的内容元素，使用 body[/yellow]")
            content_elem = soup.find('body') or soup
        
        # 提取文本，保留段落结构
        paragraphs = []
        
        # 优先提取 p, h1-h6, li 标签的内容
        for tag in content_elem.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
            text = tag.get_text(strip=True)
            # 过滤太短的内容和常见的导航文本
            if text and len(text) > 15:
                # 跳过明显的导航或菜单项
                lower_text = text.lower()
                if any(skip in lower_text for skip in ['click here', 'read more', 'learn more', 'subscribe', 'follow us']):
                    if len(text) < 50:  # 短的导航文本直接跳过
                        continue
                paragraphs.append(text)
        
        # 如果没找到段落，直接获取所有文本
        if not paragraphs or len('\n\n'.join(paragraphs)) < 100:
            console.log("[yellow]    段落提取失败，使用整体文本[/yellow]")
            return content_elem.get_text(strip=True, separator='\n\n')
        
        result = '\n\n'.join(paragraphs)
        console.log(f"[green]    提取了 {len(paragraphs)} 个段落，总长度: {len(result)} 字符[/green]")
        return result
    
    def extract_article(self, url: str, html: str) -> Optional[Dict]:
        """
        提取文章内容（混合策略）
        
        Args:
            url: 文章 URL
            html: HTML 内容
            
        Returns:
            Dict: 文章数据，如果失败返回 None
        """
        console.log(f"[cyan]📄 提取文章: {url}[/cyan]")
        
        try:
            # 步骤 1: 使用 BeautifulSoup 提取正文
            console.log("[cyan]  1/2 使用 BeautifulSoup 提取正文...[/cyan]")
            content = self._extract_content_with_beautifulsoup(html)
            
            if len(content) < 100:
                console.log("[yellow]⚠️  提取的正文太短，可能失败[/yellow]")
            
            # 步骤 2: 使用 LLM 提取元数据
            console.log("[cyan]  2/2 使用 LLM 提取元数据...[/cyan]")
            html_truncated = truncate_text(html, 30000)
            
            messages = self.metadata_extraction_prompt.format_messages(
                url=url,
                html=html_truncated
            )
            
            response = self.llm.invoke(messages)
            response_content = response.content.strip()
            
            # 提取 JSON
            if '```json' in response_content:
                response_content = response_content.split('```json')[1].split('```')[0].strip()
            elif '```' in response_content:
                response_content = response_content.split('```')[1].split('```')[0].strip()
                
            # 解析 JSON
            metadata = json.loads(response_content)
            
            # 组合数据
            article = {
                'title': metadata.get('title', ''),
                'date': metadata.get('date'),
                'author': metadata.get('author'),
                'categories': metadata.get('categories', []),
                'content': content,  # 使用 BeautifulSoup 提取的原始正文
                'url': url
            }
            
            # 生成摘要（取正文前200字符）
            article['summary'] = content[:200] + '...' if len(content) > 200 else content
            
            # 验证数据质量
            if not validate_article(article):
                console.log("[red]✗ 文章数据不完整或质量不佳[/red]")
                return None
                
            content_length = len(article.get('content', ''))
            console.log(f"[green]✓ 提取成功: {article['title'][:50]}... ({content_length} 字符)[/green]")
            
            return article
            
        except json.JSONDecodeError as e:
            console.log(f"[red]✗ JSON 解析失败: {e}[/red]")
            console.log(f"[yellow]原始响应: {response_content[:500] if 'response_content' in locals() else 'N/A'}[/yellow]")
            return None
            
        except Exception as e:
            console.log(f"[red]✗ 提取失败: {e}[/red]")
            import traceback
            console.log(f"[red]{traceback.format_exc()}[/red]")
            return None
            
    def extract_batch(self, urls_and_htmls: list) -> list:
        """
        批量提取文章
        
        Args:
            urls_and_htmls: [(url, html), ...] 列表
            
        Returns:
            list: 文章列表
        """
        articles = []
        total = len(urls_and_htmls)
        
        console.log(f"[cyan]📦 批量提取 {total} 篇文章...[/cyan]")
        
        for i, (url, html) in enumerate(urls_and_htmls, 1):
            console.log(f"\n[bold cyan][{i}/{total}][/bold cyan]")
            article = self.extract_article(url, html)
            if article:
                articles.append(article)
                
        console.log(f"\n[green]✓ 成功提取 {len(articles)}/{total} 篇文章[/green]")
        return articles
