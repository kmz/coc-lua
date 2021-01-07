import fs from "fs"
import path from "path"
import * as https from "https"

import { workspace } from "coc.nvim"

import { configDir } from "./config"
import { osEnv, install, releaseDownloadsURL } from "./installer"
import { showInstallStatus } from "./tools"

const luaLsDir = "sumneko-lua-ls"

export async function checkForUpdate(action: "disabled" | "inform" | "ask" | "install"): Promise<void> {
  const statusItem = workspace.createStatusBarItem(90, { progress: true })
  statusItem.text = "Check for updates"
  statusItem.show()

  try {
    const rinfo = await getVersionInfo()
    const linfo = await getVersionInstalledInfo()
    if (new Date(rinfo.date) > new Date(linfo.date)) {
      handleUpdateAction(action, rinfo.version)
    }
  } catch (err) {
    workspace.showMessage(JSON.stringify(err), "error")
  }

  statusItem.hide()
}

async function handleUpdateAction(action: "disabled" | "inform" | "ask" | "install", version: string) {
  switch (action) {
    case "ask":
      if (await workspace.showPrompt(`sumneko/lua-language-server ${version} is available. Install?`)) {
        installLuaLs(true)
      }
      break
    case "install":
      installLuaLs(true)
      break
    case "inform":
      workspace.showMessage(`sumneko/lua-language-server ${version} is available. Run ":CocCommand lua.update"`)
      break
  }
}

export async function installLuaLs(force = false): Promise<void> {
  if (!force && (await luaLsExists())) {
    return
  }

  await showInstallStatus("sumneko/lua-language-server", async () => {
    await install(await configDir(luaLsDir))
  })
}

export async function luaLsCommandAndArgs(): Promise<[string, string[]]> {
  const baseDir = await configDir(luaLsDir)

  const { bin } = osEnv()
  return [path.join(baseDir, bin), ["-E", path.join(baseDir, "main.lua")]]
}

export async function luaLsExists(): Promise<boolean> {
  const [bin] = await luaLsCommandAndArgs()
  return new Promise((resolve) => fs.open(bin, "r", (err) => resolve(err === null)))
}

interface versionInfo {
  date: string
  version: string
  commit: string
}

async function getVersionInstalledInfo(): Promise<versionInfo> {
  try {
    const fpath = path.join(await configDir(luaLsDir), "version.json")
    return JSON.parse(await fs.promises.readFile(fpath, "utf-8"))
  } catch (err) {
    if (err.code !== "ENOENT") {
      workspace.showMessage(JSON.stringify(err), "error")
    }

    return { date: "", version: "", commit: "" }
  }
}

async function getVersionInfo(): Promise<versionInfo> {
  return new Promise((resolve, reject) => {
    const get = (url: string) =>
      https.get(url, (res) => {
        const { statusCode } = res

        if (statusCode === 301 || statusCode === 302) {
          return get(res.headers.location)
        }

        let out = ""

        res
          .on("data", (data) => (out += data))
          .on("end", () => resolve(JSON.parse(out)))
          .on("error", (err: Error) => reject(err))
      })

    return get(releaseDownloadsURL("version.json"))
  })
}
