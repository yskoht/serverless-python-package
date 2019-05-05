import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as child_process from 'child_process';

interface pythonPackageOption {
  ppclean: boolean;
  ppno: boolean;
}

interface pythonPackageConfig {
  dockerize: boolean;
  dockerImage: string;
  command: string;
}

class ServerlessPythonPackage {
  private serverless;
  private options;
  private commands;
  private hooks;
  private runtime: string;

  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      deploy: {
        lifecycleEvents: ['resources', 'functions']
      }
    };
    this.hooks = {
      'before:deploy:resources': () => this.beforeDeployResources()
    };
    this.runtime = serverless.service.provider.runtime;
  }

  private beforeDeployResources(): void {
    const option = this.getOption(this.options);
    const config = this.getConfig(this.serverless.service.custom || {});

    if (!option.ppno) {
      this.procFunctions(config);
      this.procLayers(config);
    }
  }

  private getOption(options): pythonPackageOption {
    return {
      ppclean: !!options.ppclean,
      ppno: !!options.ppno
    };
  }

  private getConfig(custom): pythonPackageConfig {
    const c = custom.pythonPackage || {};
    return {
      dockerize: !!c.dockerize,
      dockerImage: c.dockerImage || this.defeultDockerImage(),
      command: c.command || this.defaultCommand()
    };
  }

  private defeultDockerImage(): string {
    return `lambci/lambda:build-${this.runtime}`;
  }

  private defaultCommand(): string {
    return 'pip install -r requirements.txt -t ./site-packages';
  }

  private procFunctions(config: pythonPackageConfig): void {
    const cwd = process.cwd();
    const functions = this.serverless.service.functions;
    const names = _.keys(functions);

    names.forEach(name => {
      const func = functions[name];
      const cfg = { ...config, ...this.getConfig(func) };
      const handler = func.handler;
      const dir = `${cwd}/${path.dirname(handler)}`;

      this.installPackage(cfg, dir);
    });
  }

  private procLayers(config: pythonPackageConfig): void {
    const cwd = process.cwd();
    const layers = this.serverless.service.layers;
    const names = _.keys(layers);

    names.forEach(name => {
      const layer = layers[name];
      const cfg = { ...config, ...this.getConfig(layer) };
      const p = layer.path;
      const dir = `${cwd}/${p}/python`;

      this.installPackage(cfg, dir);
    });
  }

  private installPackage(cfg: pythonPackageConfig, dir: string) {
    if (this.existsRequirement(dir)) {
      if (cfg.dockerize) {
        this.dockerPull(cfg.dockerImage);
        this.dockerRun(cfg.dockerImage, cfg.command, dir);
      } else {
        this.exeCommand(cfg.command, dir);
      }
    }
  }

  private existsRequirement(dir: string): boolean {
    const file = `${dir}/requirements.txt`;
    try {
      fs.statSync(file);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
    }
  }

  private existsDockerImage(dockerImage: string): boolean {
    const cmd = `docker image ls -q ${dockerImage}`;
    const out = this.exeCommand(cmd);
    return out !== '';
  }

  private dockerPull(dockerImage: string): void {
    if (!this.existsDockerImage(dockerImage)) {
      const cmd = `docker pull ${dockerImage}`;
      this.exeCommand(cmd);
    }
  }

  private dockerRun(dockerImage: string, command: string, dir: string): void {
    const cmd = `docker run -v ${dir}:/var/task ${dockerImage} ${command}`;
    this.exeCommand(cmd);
  }

  private exeCommand(cmd: string, cwd: string = '.'): string {
    console.log(cmd);
    const out = child_process.execSync(cmd, { cwd }).toString();
    console.log(out);
    return out;
  }
}

export = ServerlessPythonPackage;
