"""Markdown 文档生成器 - 生成原文版和小白版"""
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

console = Console()


class MarkdownGenerator:
    """Markdown 文档生成器"""
    
    def __init__(self):
        """初始化生成器"""
        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=MODEL_NAME,
            openai_api_base=OPENAI_API_BASE,
            openai_api_key=OPENAI_API_KEY,
            temperature=LLM_TEMPERATURE
        )
        
        # 标题翻译提示词
        self.title_translation_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个专业的翻译专家。请将以下英文标题翻译成中文。

要求：
1. 准确传达原意
2. 符合中文标题习惯
3. 简洁有力

只返回翻译后的中文标题，不要添加任何解释。"""),
            ("user", "{title}")
        ])
        
        # 翻译提示词（保持专业性）
        self.translation_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个专业的医学翻译专家，擅长翻译罕见病相关的新闻和文章。

请将以下英文文章翻译成中文，要求：

1. **准确性**：保持原文的专业性和准确性
2. **术语**：正确翻译医学术语和机构名称
3. **流畅性**：译文要符合中文表达习惯
4. **完整性**：翻译全部内容，不要遗漏
5. **段落分明**：保持段落结构，段落之间用空行分隔

只返回翻译后的中文内容，不要添加任何解释或注释。"""),
            ("user", "{content}")
        ])
        
        # 简化提示词（小白版）
        self.simplification_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个擅长科普写作的专家，能够将复杂的医学内容转化为通俗易懂的语言。

请将以下英文文章翻译成中文，并用**非常简单、通俗易懂**的语言重写，要求：

1. **极度简化**：像给小学生讲故事一样，用最简单的日常用语
2. **解释术语**：遇到专业词汇，立即用括号解释，例如：
   - "FDA" → "美国药监局（负责批准新药的政府部门）"
   - "Priority Review Voucher" → "优先审评券（一种奖励机制，鼓励药企研发罕见病药物）"
   - "clinical trials" → "临床试验（就是在病人身上测试新药是否安全有效）"
3. **口语化表达**：用"孩子们"代替"儿童"，用"得病"代替"罹患"
4. **生动举例**：用比喻和例子帮助理解
5. **保留核心信息**：不改变文章的主要内容和事实
6. **段落分明**：保持段落结构，段落之间用空行分隔

想象你在给一个完全不懂医学的朋友解释这篇文章，用最简单、最亲切的语言。

只返回翻译和简化后的中文内容，不要添加任何解释或注释。"""),
            ("user", "{content}")
        ])
        
    def generate_markdown_header(self, article: Dict, translated_title: str) -> str:
        """
        生成 Markdown 文件头部
        
        Args:
            article: 文章数据
            translated_title: 翻译后的标题
            
        Returns:
            str: Markdown 头部
        """
        date = article.get('date', '未知日期')
        author = article.get('author') or '未知作者'
        categories = article.get('categories', [])
        url = article.get('url', '')
        
        # 格式化标签
        tags_str = ' · '.join(categories) if categories else '无'
        
        header = f"""<div align="center">

# {translated_title}

**📅 发布日期：** {date}

**✍️ 作者：** {author}

**🏷️ 标签：** {tags_str}

**🔗 原文链接：** [{url}]({url})

</div>

---

"""
        return header
        
    def translate_title(self, title: str) -> Optional[str]:
        """翻译标题"""
        try:
            messages = self.title_translation_prompt.format_messages(title=title)
            response = self.llm.invoke(messages)
            return response.content.strip()
        except Exception as e:
            return title
        
    def translate_content(self, content: str) -> Optional[str]:
        """翻译内容（保持专业性）"""
        try:
            messages = self.translation_prompt.format_messages(content=content)
            response = self.llm.invoke(messages)
            return response.content.strip()
        except Exception as e:
            return None
            
    def simplify_and_translate_content(self, content: str) -> Optional[str]:
        """翻译并简化内容（小白版）"""
        try:
            messages = self.simplification_prompt.format_messages(content=content)
            response = self.llm.invoke(messages)
            return response.content.strip()
        except Exception as e:
            return None
            
    def generate_professional_markdown(self, article: Dict) -> Optional[str]:
        """生成专业版 Markdown"""
        title = article.get('title', '无标题')
        translated_title = self.translate_title(title)
        header = self.generate_markdown_header(article, translated_title)
        
        content = article.get('content', '')
        translated_content = self.translate_content(content)
        
        if not translated_content:
            return None
        
        formatted_content = self._format_content(translated_content)
        return header + formatted_content
        
    def generate_simplified_markdown(self, article: Dict) -> Optional[str]:
        """生成小白版 Markdown"""
        title = article.get('title', '无标题')
        translated_title = self.translate_title(title)
        header = self.generate_markdown_header(article, translated_title)
        
        content = article.get('content', '')
        simplified_content = self.simplify_and_translate_content(content)
        
        if not simplified_content:
            return None
        
        formatted_content = self._format_content(simplified_content)
        return header + formatted_content
    
    def _format_content(self, content: str) -> str:
        """格式化内容，确保段落分明"""
        paragraphs = content.split('\n')
        cleaned = [p.strip() for p in paragraphs if p.strip()]
        return '\n\n'.join(cleaned)
        
    def generate_both_markdowns(self, article: Dict) -> tuple[Optional[str], Optional[str]]:
        """生成两个版本的 Markdown"""
        professional_md = self.generate_professional_markdown(article)
        simplified_md = self.generate_simplified_markdown(article)
        return professional_md, simplified_md
