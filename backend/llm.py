from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from fastapi import HTTPException
from backend.models import ModelConfig
from langchain.agents import create_agent
from backend.tool.agentTools import tools

def get_llm(config: ModelConfig):
    provider = config.provider
    model_name = config.model_name
    api_key = config.api_key
    base_url = config.base_url
    temperature = config.temperature

    try:
        if provider == "openai":
            return ChatOpenAI(
                model=model_name or "gpt-3.5-turbo",
                api_key=api_key,
                base_url=base_url,
                temperature=temperature,
                streaming=True,
            )
        elif provider == "deepseek":
            return ChatOpenAI(
                model=model_name or "deepseek-chat",
                api_key=api_key,
                base_url=base_url or "https://api.deepseek.com/v1",
                temperature=temperature,
                streaming=True,
            )
        elif provider == "ollama":
            return ChatOllama(
                model=model_name or "llama3",
                base_url=base_url or "http://localhost:11434",
                temperature=temperature,
                # Ollama 的流式通过调用时 astream 自动支持
            )
        else:
            raise HTTPException(status_code=400, detail=f"不支持的模型提供商: {provider}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"模型初始化失败: {str(e)}")

def get_agent(config: ModelConfig, node_id: str = 'null'):
    llm = get_llm(config)
    try:
        agent = create_agent(
            model=llm,
            system_prompt=f"""
            你是一名辅助人学习的老师，一般使用中文回答。
            
            这是你所在的节点ID{node_id},如果为空(null)则说明不在树状图模式,不用理会,也不用调用节点，路径相关的工具函数,如果不为空，则说明在树状图模式，按要求调用节点，路径相关工具函数

            【重要规则】
            1,当用户要求画树状图、流程图、知识图谱时，你必须在回答中直接输出 Mermaid 代码块。
            格式要求：
            ```mermaid
            mindmap
              root((主题))
                分支1
                  子节点1
                  子节点2
                分支2
        
            """,
            tools=tools,
        )
        return agent
    except Exception as e:
        raise HTTPException(detail=f"创建agent失败: {str(e)}")