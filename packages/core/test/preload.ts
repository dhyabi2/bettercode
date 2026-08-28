import path from "path"

process.env.BETTERCODE_DB = ":memory:"
process.env.BETTERCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.BETTERCODE_DISABLE_MODELS_FETCH = "true"
