"""网站结构探索器 - 使用 Qwen3-max 分析页面结构"""
import json
from typing import Dict, Optional
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from rich.console import Console

from config.settings import (
    OPENAI_API_BASE,
    OPENAI_API_KEY,
    MODEL_NAME,
    LLM_TEMPERATURE
)
from utils.helpers import clean_html, truncate_text

console = Console()


class WebsiteExplorer:
    """网站结构探索器"""
    
    def __init__(self):
        """初始化探索器"""
        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=MODEL_NAME,
            openai_api_base=OPENAI_API_BASE,
            openai_api_key=OPENAI_API_KEY,
            temperature=LLM_TEMPERATURE
        )
        
        # 分析提示词
        self.analysis_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个网页结构分析专家。你的任务是分析 HTML 页面，识别页面类型和结构。

请分析以下 HTML 并提取信息：

1. **页面类型**：
   - article_list: 文章列表页（包含多个文章链接）
   - single_article: 单篇文章页
   - blog_home: 博客首页
   - news_archive: 新闻归档页

2. **文章链接位置**：
   - 仔细查找 HTML 中真正的文章标题链接
   - 常见模式：article h4 a, article h3 a, h4 a, h3 a, h2 a
   - 排除导航菜单、页眉页脚中的链接
   - 选择器示例: "article h4 a", "h4 a", ".post-title a", ".news-item a"

3. **分页信息**：
   - 是否有分页
   - 总页数（如果能识别）
   - 下一页的选择器

4. **其他信息**：
   - 文章数量
   - 页面布局特点

**重要提示**：
- 优先查找 h2, h3, h4 标签内的链接，这些通常是文章标题
- 如果发现 article h4 a 或 h4 a 有多个链接，优先使用它们
- 不要选择导航菜单中的链接

**输出格式（JSON）**：
```json
{{
  "page_type": "article_list",
  "article_count": 10,
  "selectors": {{
    "article_links": "article h4 a",
    "article_titles": "article h4",
    "next_page": "a.next"
  }},
  "pagination": {{
    "has_pagination": true,
    "total_pages": 108,
    "pagination_selector": ".pagination"
  }},
  "notes": "页面包含文章列表，每页10篇文章，文章标题在 h4 标签内"
}}
```

只返回 JSON，不要其他解释。"""),
            ("user", "URL: {url}\n\nHTML（前30000字符）:\n{html}")
        ])
        
    def analyze_page_structure(self, url: str, html: str) -> Dict:
        """
        分析页面结构
        
        Args:
            url: 页面 URL
            html: HTML 内容
            
        Returns:
            Dict: 页面结构信息
        """
        console.log("[cyan]🔍 分析页面结构...[/cyan]")
        
        try:
            # 截断 HTML（避免超过 token 限制）
            html_truncated = truncate_text(html, 30000)
            
            # 调用 LLM 分析
            messages = self.analysis_prompt.format_messages(
                url=url,
                html=html_truncated
            )
            
            response = self.llm.invoke(messages)
            content = response.content.strip()
            
            # 提取 JSON
            # 有时 LLM 会用 ```json 包裹，需要清理
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].split('```')[0].strip()
                
            # 解析 JSON
            result = json.loads(content)
            
            console.log(f"[green]✓ 页面类型: {result.get('page_type')}[/green]")
            console.log(f"[green]✓ 文章数量: {result.get('article_count')}[/green]")
            
            if result.get('pagination', {}).get('has_pagination'):
                total = result['pagination'].get('total_pages', '未知')
                console.log(f"[green]✓ 分页: 是 (共 {total} 页)[/green]")
            
            return result
            
        except json.JSONDecodeError as e:
            console.log(f"[red]✗ JSON 解析失败: {e}[/red]")
            console.log(f"[yellow]原始响应: {content[:500]}[/yellow]")
            return self._fallback_analysis(html)
            
        except Exception as e:
            console.log(f"[red]✗ 分析失败: {e}[/red]")
            return self._fallback_analysis(html)
            
    def _fallback_analysis(self, html: str) -> Dict:
        """回退分析（简单规则）"""
        console.log("[yellow]⚠️  使用回退分析策略[/yellow]")
        
        # 简单的启发式分析
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'lxml')
        
        # 查找常见的文章链接
        article_links = []
        
        # 尝试多种选择器（按优先级排序）
        selectors = [
            'article h4 a',  # rarediseases.org 使用这个
            'h4 a',
            'article h3 a',
            'h3 a',
            'article h2 a',
            'h2 a',
            '.post-title a',
            '.entry-title a',
            'article a',
            '.post a',
            '.news-item a',
            '.article-title a'
        ]
        
        best_selector = None
        max_links = 0
        best_links = []
        
        for selector in selectors:
            try:
                links = soup.select(selector)
                # 过滤掉导航链接等，只保留真正的文章链接
                valid_links = [
                    link for link in links 
                    if link.get('href') and 
                    ('http' in link.get('href') or link.get('href').startswith('/')) and
                    link.text.strip()  # 必须有文本
                ]
                
                # 选择数量合理的选择器（通常文章列表有5-20篇）
                if 5 <= len(valid_links) <= 50 and len(valid_links) > max_links:
                    max_links = len(valid_links)
                    best_selector = selector
                    best_links = valid_links
            except:
                pass
        
        # 如果没找到合适的，放宽条件
        if not best_selector:
            for selector in selectors:
                try:
                    links = soup.select(selector)
                    if len(links) > max_links:
                        max_links = len(links)
                        best_selector = selector
                except:
                    pass
                
        # 检测分页
        has_pagination = bool(soup.select('.pagination, .pager, .page-numbers'))
        
        console.log(f"[cyan]回退分析: 选择器='{best_selector}', 链接数={max_links}[/cyan]")
        
        return {
            'page_type': 'article_list' if max_links > 3 else 'single_article',
            'article_count': max_links,
            'selectors': {
                'article_links': best_selector or 'a'
            },
            'pagination': {
                'has_pagination': has_pagination,
                'total_pages': None
            },
            'notes': '使用回退分析'
        }
