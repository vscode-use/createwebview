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
- provider.deferScript ***在默认脚本之后注入可信内联 JavaScript。推荐只传 JavaScript 源码；外部脚本请使用 scripts 或 deferScriptUri。***
- provider.deferScriptUri ***从 media 目录加载延迟脚本***
- provider.setProps ***设置可在延迟脚本中通过 window.__WEBVIEW_PROPS__ 读取的参数***
- provider.postMessage ***向js层发送消息***

## Feature

本地 scripts 和 styles 都会从扩展的 `media` 目录解析。webview 默认会注入 CSP，所以远程 script/style 来源需要通过 `allowedScriptSources` 和 `allowedStyleSources` 显式声明，或者传入自定义 `csp`。通过 `scripts` 和 `styles` 传入的远程资源会在渲染前校验；HTML 文件中已有的远程资源不会预校验，会由注入的 CSP 控制。字体和图片来源默认允许 VS Code webview 资源、`https:` 和 `data:`；额外来源可以通过 `allowedImageSources`、`allowedFontSources`、`allowedConnectSources`、`allowedMediaSources`、`allowedFrameSources`、`allowedManifestSources`、`allowedWorkerSources` 和 `allowedPrefetchSources` 添加。

`scripts` 选项只接收脚本路径或 URL。内联 JavaScript 请使用 `deferScript`。

`createWithHTMLUrl` 只会重写 `script`、`img`、`source`、`video`、`audio`、`track`、`iframe` 上的本地 `src`，以及 stylesheet、icon 等资源型 `link href`；这些属性必须使用双引号，且路径以 `./` 或单个 `/` 开头，例如 `src="./app.js"`。`a href`、`base href`、canonical link 等普通链接不会被重写。`src="//cdn.example.com/app.js"` 这样的 protocol-relative URL、`src="app.js"` 这样的裸文件名、单引号属性、`srcset` 和 CSS `url(...)` 不会被重写。

传给 `createWithHTMLUrl` 的 HTML 文件不能包含自己的 CSP meta 标签，因为运行时会注入 CSP。默认 CSP 会作用于 `create(html)` 和 `createWithHTMLUrl(htmlUrl)` 渲染出的最终 HTML，所以内联 `<script>`、内联 `<style>` 和 style attributes 默认会被阻止，除非你传入自定义 `csp`。请把脚本放到 `media` 并通过 `scripts` 或 `deferScriptUri` 引入，或者通过 `csp` 明确放开。

传入自定义 `csp` 时，请包含 `${nonce}` 以允许运行时内联脚本，并包含 `${webview.cspSource}` 以允许本地 webview 资源：

```text
script-src ${webview.cspSource} 'nonce-${nonce}';
style-src ${webview.cspSource};
```

`deferScriptUri` 会把 `media` 下浏览器可直接执行的 `.js` 文件作为外部脚本注入。TypeScript 需要先编译成 JavaScript。渲染前先调用 `setProps`，脚本里通过 `window.__WEBVIEW_PROPS__` 读取参数。

运行时代码默认不会把 VS Code API 暴露到 `window`。可信的 webview 脚本可以直接调用 `acquireVsCodeApi()`。如果需要旧的全局 API，可以设置 `exposeVsCodeApi: true` 得到 `window.vscode`，也可以传字符串，例如 `exposeVsCodeApi: 'editorApi'`。

```ts
const { name, age } = window.__WEBVIEW_PROPS__
const vscode = acquireVsCodeApi()
vscode.postMessage({ type: 'ready' })
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

## 从 0.0.x 迁移

这个版本包含破坏性行为变化，发布时应该使用 `0.1.0`。

- `retainContextWhenHidden` 现在默认是 `false`。
- 远程 scripts 和 styles 必须通过 `allowedScriptSources`、`allowedStyleSources` 显式允许，除非传入自定义 `csp`。
- `scripts` 只接受路径和 URL。内联 JavaScript 请使用 `deferScript`。
- `deferScriptUri` 现在会从 `media` 注入外部脚本，不再读取文件并内联。
- props 现在通过 `window.__WEBVIEW_PROPS__` 读取，不再是 `webviewThis`。
- VS Code API 默认不再暴露为 `window.vscode`。在可信脚本里使用 `acquireVsCodeApi()`，或通过 `exposeVsCodeApi` 显式开启。

## Cases
- [vscode icones](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-icones)
- [vscode yesicone](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-yesicon)

## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>
