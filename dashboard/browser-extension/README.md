# Hayk Browser Helper

Chrome extension for sending compact visible page context to the local dashboard backend.

## Load locally

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `dashboard/browser-extension`.

Backend must be running at `http://127.0.0.1:8000`.

## Model modes

- `workhorse`: `minimax/minimax-m2.5:free`
- `fast`: `nvidia/nemotron-3-nano-30b-a3b:free`
- `smart`: `z-ai/glm-4.5-air:free`
- `auto`: `openrouter/free`
- `backup`: `openai/gpt-oss-20b:free`

The backend rejects non-free models unless `AGENT_ALLOW_PAID_MODELS=true`.
