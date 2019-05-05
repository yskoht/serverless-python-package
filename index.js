"use strict";
const _ = require("lodash");
const fs = require("fs");
const path = require("path");
const process = require("process");
const child_process = require("child_process");
class ServerlessPythonPackage {
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
    beforeDeployResources() {
        const option = this.getOption(this.options);
        const config = this.getConfig(this.serverless.service.custom || {});
        if (!option.ppno) {
            this.procFunctions(config);
            this.procLayers(config);
        }
    }
    getOption(options) {
        return {
            ppclean: !!options.ppclean,
            ppno: !!options.ppno
        };
    }
    getConfig(custom) {
        const c = custom.pythonPackage || {};
        return {
            dockerize: !!c.dockerize,
            dockerImage: c.dockerImage || this.defeultDockerImage(),
            command: c.command || this.defaultCommand()
        };
    }
    defeultDockerImage() {
        return `lambci/lambda:build-${this.runtime}`;
    }
    defaultCommand() {
        return 'pip install -r requirements.txt -t ./site-packages';
    }
    procFunctions(config) {
        const cwd = process.cwd();
        const functions = this.serverless.service.functions;
        const names = _.keys(functions);
        names.forEach(name => {
            const func = functions[name];
            const cfg = Object.assign({}, config, this.getConfig(func));
            const handler = func.handler;
            const dir = `${cwd}/${path.dirname(handler)}`;
            this.installPackage(cfg, dir);
        });
    }
    procLayers(config) {
        const cwd = process.cwd();
        const layers = this.serverless.service.layers;
        const names = _.keys(layers);
        names.forEach(name => {
            const layer = layers[name];
            const cfg = Object.assign({}, config, this.getConfig(layer));
            const p = layer.path;
            const dir = `${cwd}/${p}/python`;
            this.installPackage(cfg, dir);
        });
    }
    installPackage(cfg, dir) {
        if (this.existsRequirement(dir)) {
            if (cfg.dockerize) {
                this.dockerPull(cfg.dockerImage);
                this.dockerRun(cfg.dockerImage, cfg.command, dir);
            }
            else {
                this.exeCommand(cfg.command, dir);
            }
        }
    }
    existsRequirement(dir) {
        const file = `${dir}/requirements.txt`;
        try {
            fs.statSync(file);
            return true;
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                return false;
            }
        }
    }
    existsDockerImage(dockerImage) {
        const cmd = `docker image ls -q ${dockerImage}`;
        const out = this.exeCommand(cmd);
        return out !== '';
    }
    dockerPull(dockerImage) {
        if (!this.existsDockerImage(dockerImage)) {
            const cmd = `docker pull ${dockerImage}`;
            this.exeCommand(cmd);
        }
    }
    dockerRun(dockerImage, command, dir) {
        const cmd = `docker run -v ${dir}:/var/task ${dockerImage} ${command}`;
        this.exeCommand(cmd);
    }
    exeCommand(cmd, cwd = '.') {
        console.log(cmd);
        const out = child_process.execSync(cmd, { cwd }).toString();
        console.log(out);
        return out;
    }
}
module.exports = ServerlessPythonPackage;
