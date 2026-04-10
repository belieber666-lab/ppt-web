"""
PPT 样式迁移 API
FastAPI 后端，监听 0.0.0.0:8000

端点：
  POST /api/apply-template
    form-data: template (pptx), content (pptx)
    返回: application/vnd.openxmlformats-officedocument.presentationml.presentation

  GET  /health
"""

import os
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from pptx_processor import process_pptx

app = FastAPI(title="PPT 样式迁移 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PPTX_MIME = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)


def _schedule_delete(path: str, delay: int = 120) -> None:
    """后台线程：延迟删除临时文件。"""
    def _run():
        time.sleep(delay)
        try:
            os.remove(path)
        except Exception:
            pass

    t = threading.Thread(target=_run, daemon=True)
    t.start()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/apply-template")
async def apply_template(
    template: UploadFile = File(..., description="模板 PPTX（提供样式）"),
    content: UploadFile = File(..., description="内容 PPTX（白底黑字）"),
):
    # 校验文件类型
    for f in (template, content):
        name = f.filename or ""
        if not name.lower().endswith(".pptx"):
            raise HTTPException(
                status_code=400,
                detail=f"文件 '{name}' 不是 .pptx 格式",
            )

    # 写入临时目录
    with tempfile.TemporaryDirectory() as tmp:
        tmpl_path = os.path.join(tmp, "template.pptx")
        cont_path = os.path.join(tmp, "content.pptx")
        out_path = os.path.join(tmp, "result.pptx")

        with open(tmpl_path, "wb") as fh:
            fh.write(await template.read())
        with open(cont_path, "wb") as fh:
            fh.write(await content.read())

        try:
            process_pptx(tmpl_path, cont_path, out_path)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"处理失败：{exc}",
            ) from exc

        if not os.path.exists(out_path):
            raise HTTPException(status_code=500, detail="输出文件未生成")

        # 将结果复制到系统临时目录，供下载后删除
        import shutil, uuid
        final_name = f"result_{uuid.uuid4().hex[:8]}.pptx"
        final_path = os.path.join(tempfile.gettempdir(), final_name)
        shutil.copy2(out_path, final_path)

    _schedule_delete(final_path, delay=300)

    return FileResponse(
        path=final_path,
        media_type=PPTX_MIME,
        filename="styled_presentation.pptx",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
