import path from "path"

process.env.NANOCODE_DB = ":memory:"
process.env.NANOCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.NANOCODE_DISABLE_MODELS_FETCH = "true"
