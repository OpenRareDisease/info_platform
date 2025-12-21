"""辅助函数"""
import re
from typing import Optional
from datetime import datetime
from bs4 import BeautifulSoup


def clean_html(html: str) -> str:
    """清理 HTML"""
    soup = BeautifulSoup(html, 'lxml')
    
    for script in soup(['script', 'style', 'meta', 'link']):
        script.decompose()
        
    text = soup.get_text()
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = '\n'.join(chunk for chunk in chunks if chunk)
    
    return text


def extract_domain(url: str) -> str:
    """从 URL 提取域名"""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.netloc
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain


def normalize_url(url: str, base_url: str) -> str:
    """规范化 URL（转换为绝对 URL）"""
    from urllib.parse import urljoin
    return urljoin(base_url, url)


def parse_date(date_str: str) -> Optional[str]:
    """解析日期"""
    if not date_str:
        return None
        
    formats = ['%Y-%m-%d', '%Y/%m/%d', '%B %d, %Y', '%b %d, %Y', '%d %B %Y', '%d %b %Y']
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.date().isoformat()
        except:
            continue
            
    return date_str


def truncate_text(text: str, max_length: int = 30000) -> str:
    """截断文本到指定长度"""
    if len(text) <= max_length:
        return text
    return text[:max_length]


def validate_article(article: dict) -> bool:
    """验证文章数据"""
    if not article.get('title'):
        return False
    if len(article.get('content', '')) < 100:
        return False
    if not article.get('url'):
        return False
    return True
