<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> <a href="./README.md">English</a> | 简体中文</p>

1分钟让你打造一个webview的vscode插件

### Install

```
npm i @vscode-use/createwebview
```

## Usage1

```ts
function activate(context: vscode.ExtensionContext) {
  const provider = new CreateWebview(context, {
    viewType: 'dailyPlanner',
    title: 'Daily planner',
    scripts: ['https://unpkg.com/vue@2/dist/vue.js', 'https://unpkg.com/element-ui/lib/index.js'],
    styles: ['reset.css', 'https://unpkg.com/element-ui/lib/theme-chalk/index.css', 'main.css'],
    allowedScriptSources: ['https://unpkg.com'],
    allowedStyleSources: ['https://unpkg.com'],
  })

  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', async () => {
    await provider.create(`
      <div id="app">
        <div>Hello, World</div>
      </div>
    `, (data) => {
      // callback 获取js层的postMessage数据
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

## Usage2

```ts
function activate(context: vscode.ExtensionContext) {
  const provider = new CreateWebview(context, {
    viewType: 'dailyPlanner',
    title: 'Daily planner',
  })

  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', async () => {
    // 基于根目录的相对路径
    // html 中本地径资源(href="" | src="")需要使用相对路径, 并且放到根目录的 media 文件夹下
    await provider.createWithHTMLUrl('./src/webview/index.html', (data) => {
      // callback 获取js层的postMessage数据
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

## Api

- provider.isActive ***检测当前 webview 是否已经打开***
- provider.create ***创建 webview***
- provider.createWithHTMLUrl ***通过 HTML 文件创建 webview***
- provider.destroy ***销毁关闭 webview***
- provider.destory ***destroy 的旧拼写别名***
- provider.deferScript ***默认 js 是加载在 body 的后面,deferScript 会在默认的 js 之后注入，并且为了解决一些默认数据渲染的问题，支持'<script>xxx</script>'***
- provider.deferScriptUri ***从 media 目录加载延迟脚本***
- provider.setProps ***设置可在延迟脚本中通过 window.__WEBVIEW_PROPS__ 读取的参数***
- provider.postMessage ***向js层发送消息***

## Feature

本地 scripts 和 styles 都会从扩展的 `media` 目录解析。webview 默认会注入 CSP，所以远程 script/style 来源需要通过 `allowedScriptSources` 和 `allowedStyleSources` 显式声明，或者传入自定义 `csp`。默认 CSP 下未允许的远程 script/style 会在渲染前抛错。字体来源默认允许 VS Code webview 资源、`https:` 和 `data:`；额外的字体和网络请求来源可以通过 `allowedFontSources`、`allowedConnectSources` 添加。

`scripts` 选项只接收脚本路径或 URL。内联 JavaScript 请使用 `deferScript`。

`createWithHTMLUrl` 只会重写使用双引号、且路径以 `./` 或 `/` 开头的本地 `src` 和 `href` 资源，例如 `src="./app.js"`。`src="app.js"` 这样的裸文件名、单引号属性、`srcset` 和 CSS `url(...)` 不会被重写。

传给 `createWithHTMLUrl` 的 HTML 文件不能包含自己的 CSP meta 标签，因为运行时会注入 CSP。默认 CSP 会阻止 HTML 文件里的内联 `<script>`、内联 `<style>` 和 style attributes，除非你传入自定义 `csp`。请把脚本放到 `media` 并通过 `scripts` 或 `deferScriptUri` 引入，或者通过 `csp` 明确放开。

`deferScriptUri` 会把 `media` 下浏览器可直接执行的 `.js` 文件作为外部脚本注入。TypeScript 需要先编译成 JavaScript。渲染前先调用 `setProps`，脚本里通过 `window.__WEBVIEW_PROPS__` 读取参数。

运行时代码会把 VS Code API 暴露为 `window.vscode`。业务脚本中使用 `window.vscode.postMessage(...)`，不要再次调用 `acquireVsCodeApi()`。

```ts
const { name, age } = window.__WEBVIEW_PROPS__
const App = {
  data() {
    return {
      name,
      age,
    }
  },
}
new Vue(App).$mount('#app')
```

## Cases
- [vscode icones](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-icones)
- [vscode yesicone](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-yesicon)

## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>
