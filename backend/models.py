from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, field_validator, Field
from typing import Optional
import uuid

class ModelConfig(BaseModel):
    id: str = ""
    name: str
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    temperature: float = 0.7
    usability: Optional[bool] = None

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, v, info):
        provider = info.data.get('provider')
        if provider and provider != 'ollama':
            if not v or v.strip() == '':
                raise ValueError(f'提供商 {provider} 需要提供 API Key')
        return v

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, v):
        if v is not None and v.strip() != '':
            if '://' not in v:
                raise ValueError('base_url 必须包含协议 (如 http:// 或 https://)')
        return v

    @field_validator('temperature')
    @classmethod
    def validate_temperature(cls, v):
        if v < 0 or v > 2:
            raise ValueError('temperature 必须在 0 到 2 之间')
        return v

class Message(BaseModel):
    id: str = str(uuid.uuid4())
    role: str
    content: str
    timestamp: str = datetime.now().isoformat()

class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = "新对话"
    messages: List[Message] = []

    summary: Optional[str] = ""
    summarized_until: int = 0
    summary_update_at: Optional[str] = None

    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    update_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    model_id: Optional[str] = None

class ChatRequest(BaseModel):
    prompt: str
    conversation_id: str
    TreeMode: bool = False
    current_node_id: Optional[str] = None

class ConfirmJudgeRequest(BaseModel):
    thread_id: str
    decision: Literal["confirm", "reject"]