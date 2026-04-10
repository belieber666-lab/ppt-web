import cors from "cors";
import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
const SCRIPTS_DIR = path.resolve(__dirname, "../scripts");
const APPLY_SCRIPT = path.join(SCRIPTS_DIR, "apply_template.sh");
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            const dir = path.join(os.tmpdir(), "ppt-apply", randomUUID());
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (_req, file, cb) => {
            cb(null, file.originalname);
        },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype ===
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
            file.originalname.endsWith(".pptx")) {
            cb(null, true);
        }
        else {
            cb(new Error("Only .pptx files are accepted"));
        }
    },
});
// ── Health ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.get("/api/health/libreoffice", (_req, res) => {
    execFile("soffice", ["--version"], { timeout: 5000 }, (err, stdout) => {
        if (err) {
            res.status(503).json({ ok: false, error: "LibreOffice not found" });
        }
        else {
            res.json({ ok: true, version: stdout.trim() });
        }
    });
});
// ── Apply Template ────────────────────────────────────────────────
const applyUpload = upload.fields([
    { name: "template", maxCount: 1 },
    { name: "content", maxCount: 1 },
]);
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.post("/api/apply-template", (req, res) => {
    applyUpload(req, res, (uploadErr) => {
        if (uploadErr) {
            const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
            return res.status(400).json({ error: msg });
        }
        const files = req.files;
        const templateFile = files?.template?.[0];
        const contentFile = files?.content?.[0];
        if (!templateFile || !contentFile) {
            return res
                .status(400)
                .json({ error: "Both 'template' and 'content' files are required" });
        }
        const workDir = path.dirname(templateFile.path);
        const outputPath = path.join(workDir, "result.pptx");
        console.log(`[apply] template=${templateFile.path}`);
        console.log(`[apply] content=${contentFile.path}`);
        console.log(`[apply] output=${outputPath}`);
        execFile("bash", [APPLY_SCRIPT, templateFile.path, contentFile.path, outputPath], { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (stderr)
                console.log(`[apply] log:\n${stderr}`);
            if (err) {
                console.error(`[apply] FAILED:`, err.message);
                cleanup(workDir);
                return res.status(500).json({
                    error: "Template application failed",
                    details: stderr || err.message,
                });
            }
            if (!fs.existsSync(outputPath)) {
                cleanup(workDir);
                return res.status(500).json({ error: "Output file was not created" });
            }
            const stat = fs.statSync(outputPath);
            console.log(`[apply] SUCCESS, result size=${stat.size}`);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
            res.setHeader("Content-Disposition", 'attachment; filename="result.pptx"');
            res.setHeader("Content-Length", stat.size);
            const stream = fs.createReadStream(outputPath);
            stream.pipe(res);
            stream.on("end", () => cleanup(workDir));
            stream.on("error", () => {
                cleanup(workDir);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to stream result" });
                }
            });
        });
    });
});
function cleanup(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch {
        /* ignore */
    }
}
// ── Start ─────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
    console.log(`[api] apply script: ${APPLY_SCRIPT}`);
});
