import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { createHash, BinaryLike } from "crypto";
import { Target } from "./meson/types";
import { ExtensionConfiguration } from "./types";
import { getMesonBuildOptions } from "./meson/introspection";
import { extensionPath } from "./extension";

export async function exec(
  command: string,
  args: string[],
  options: cp.ExecOptions = {}
): Promise<{ stdout: string; stderr: string, error?: cp.ExecException }> {
  return new Promise<{ stdout: string; stderr: string, error?: cp.ExecException }>((resolve, reject) => {
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export function execStream(
  command: string,
  args: string[],
  options: cp.SpawnOptions
) {
  const spawned = cp.spawn(command, args, options);
  return {
    onLine(fn: (line: string, isError: boolean) => void) {
      spawned.stdout.on("data", (msg: Buffer) => fn(msg.toString(), false));
      spawned.stderr.on("data", (msg: Buffer) => fn(msg.toString(), true));
    },
    kill(signal?: NodeJS.Signals) {
      spawned.kill(signal || "SIGKILL");
    },
    finishP() {
      return new Promise<number>(res => {
        spawned.on("exit", code => res(code));
      });
    }
  };
}

export function execAsTask(
  command: string,
  args: string[],
  options: vscode.ProcessExecutionOptions,
  revealMode = vscode.TaskRevealKind.Silent
) {
  const task = new vscode.Task(
    { type: "temp" },
    command,
    "Meson",
    new vscode.ProcessExecution(command, args, options)
  );
  task.presentationOptions.echo = false;
  task.presentationOptions.focus = false;
  task.presentationOptions.reveal = revealMode;
  return vscode.tasks.executeTask(task);
}

export async function parseJSONFileIfExists<T = object>(path: string) {
  try {
    const data = await fs.promises.readFile(path);
    return JSON.parse(data.toString()) as T;
  }
  catch (err) {
    return false;
  }
}

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Meson Build");
  }
  return _channel;
}

export function extensionRelative(filepath: string) {
  return path.join(extensionPath, filepath);
}

export function workspaceRelative(filepath: string) {
  return path.resolve(vscode.workspace.rootPath, filepath);
}

export async function getTargetName(target: Target) {
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));
  const buildOptions = await getMesonBuildOptions(buildDir);
  const layoutOption = buildOptions.filter(o => o.name === "layout")[0];

  if (layoutOption.value === "mirror") {
    const relativePath = path.relative(vscode.workspace.rootPath, path.dirname(target.defined_in));

    // Meson requires the separator between path and target name to be '/'.
    return path.posix.join(relativePath, target.name);
  }
  else {
    return `meson-out/${target.name}`;
  }
}

export function hash(input: BinaryLike) {
  const hashObj = createHash("sha1");
  hashObj.update(input);
  return hashObj.digest("hex");
}

export function getConfiguration() {
  return vscode.workspace.getConfiguration("mesonbuild");
}

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(
  key: K
) {
  return getConfiguration().get<ExtensionConfiguration[K]>(key);
}

export function extensionConfigurationSet<
  K extends keyof ExtensionConfiguration
>(
  key: K,
  value: ExtensionConfiguration[K],
  target = vscode.ConfigurationTarget.Global
) {
  return getConfiguration().update(key, value, target);
}

export function arrayIncludes<T>(array: T[], value: T) {
  return array.indexOf(value) !== -1;
}

export function isThenable<T>(x: vscode.ProviderResult<T>): x is Thenable<T> {
  return arrayIncludes(Object.getOwnPropertyNames(x), "then");
}
