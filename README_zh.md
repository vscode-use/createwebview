<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> <a href="./README.md">English</a> | 简体中文</p>

一个用于创建 VS Code WebviewPanel 的轻量、CSP-aware helper。

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
    // HTML 文件路径基于 extension root
    // HTML 内的本地 src/href 资源默认从 media 解析，不是相对 HTML 文件目录
    await provider.createWithHTMLUrl('./src/webview/index.html', (data) => {
      // callback 获取js层的postMessage数据
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

HTML 文件中已有的远程资源会保留原样，是否允许加载由注入的 CSP 决定。

## Api

- provider.isOpen ***检测当前 provider 是否有打开的 webview panel***
- provider.isActive ***检测当前 provider 的 webview panel 是否为 active editor panel***
- provider.isVisible ***检测当前 provider 的 webview panel 是否可见***
- provider.reveal ***如果当前 webview panel 存在，则 reveal 它***
- provider.create ***创建 webview***
- provider.createWithHTMLUrl ***通过 HTML 文件创建 webview***
- provider.destroy ***销毁关闭 webview***
- provider.destory ***destroy 的旧拼写别名***
- provider.deferScript ***在默认脚本之后注入可信内联 JavaScript 源码；外部脚本请使用 scripts 或 deferScriptUri。***
- provider.deferScriptUri ***延迟脚本 URI 的旧追加别名***
- provider.setDeferredScriptUris ***替换延迟脚本 URI***
- provider.addDeferredScriptUris ***追加延迟脚本 URI***
- provider.clearDeferredScriptUris ***清空延迟脚本 URI***
- provider.setProps ***设置可在延迟脚本中通过 window.__WEBVIEW_PROPS__ 读取的参数***
- provider.postMessage ***向js层发送消息***

## Feature

本地 scripts 和 styles 默认都会从扩展的 `media` 目录解析。资源放在其他扩展相对目录时可以设置 `mediaRoot`，需要直接控制 VS Code 资源根时可以设置 `localResourceRoots`。`mediaRoot` 会按 extension-relative path 规范化，并拒绝 parent directory segments。webview 默认会注入 CSP，所以远程 script/style 来源需要通过 `allowedScriptSources` 和 `allowedStyleSources` 显式声明，或者传入自定义 `csp`。通过 `scripts` 和 `styles` 传入的远程资源会在渲染前校验；HTML 文件中已有的远程资源不会预校验，会由注入的 CSP 控制。字体和图片来源默认允许 VS Code webview 资源、`https:` 和 `data:`；设置 `strictCsp: true` 后只允许 VS Code webview 资源以及显式配置的 `allowedImageSources` 和 `allowedFontSources`。额外来源可以通过 `allowedImageSources`、`allowedFontSources`、`allowedConnectSources`、`allowedMediaSources`、`allowedFrameSources`、`allowedManifestSources`、`allowedWorkerSources` 和 `allowedPrefetchSources` 添加。

`allowedScriptSources` 和 `allowedStyleSources` 推荐填写 `https:`、`https://cdn.example.com` 这样的 origin、`https://*.example.com` 这样的通配 origin，或具体 URL/path。更复杂的 CSP source expression 请直接使用自定义 `csp`。

`scripts` 选项只接收脚本路径或 URL。内联 JavaScript 请使用 `deferScript`。

`viewType` 默认是 `createwebview.panel`。如果需要区分不同 panel 类型，请传入你自己的稳定 extension-level id。

每个 `CreateWebview` 实例只维护一个 panel。后续成功执行的 `create` 或 `createWithHTMLUrl` 会 dispose 上一个 panel。

`createWithHTMLUrl` 会重写 `script`、`img`、`source`、`video`、`audio`、`track`、`iframe` 上的本地 `src`，以及 stylesheet、icon 等资源型 `link href`。属性可以使用双引号、单引号或不加引号；路径可以以 `./`、单个 `/` 开头，也可以使用 `src="app.js"` 这样的裸相对文件名。它也会重写 `img` 和 `source` 上的本地 `srcset` 项，以及 inline `style` 属性和 `<style>` 标签里的本地 CSS `url(...)`。它不会解析或重写 `script`、`textarea`、`title` 元素 raw text 内部的伪标签。`a href`、`base href`、canonical link 等普通链接不会被重写。`src="//cdn.example.com/app.js"` 这样的 protocol-relative URL 和外部 URL 不会被重写。通过 `link` 加载的 CSS 文件不会被解析。

传给 `createWithHTMLUrl` 的 HTML 文件不能包含自己的 CSP meta 标签，因为运行时会注入 CSP。默认 CSP 会作用于 `create(html)` 和 `createWithHTMLUrl(htmlUrl)` 渲染出的最终 HTML，所以内联 `<script>`、内联 `<style>` 和 style attributes 默认会被阻止，除非你传入自定义 `csp`。请把脚本放到 `media` 并通过 `scripts`、`setDeferredScriptUris` 或 `addDeferredScriptUris` 引入，或者通过 `csp` 明确放开。

如果 HTML 文件已经包含 CSP meta 标签，`createWithHTMLUrl` 默认会拒绝渲染。设置 `existingCsp: 'replace'` 可以移除已有标签并注入 createwebview 的运行时 CSP。

传入自定义 `csp` 时，请包含 `${nonce}` 以允许运行时内联脚本，并包含 `${webview.cspSource}` 以允许本地 webview 资源：

```text
script-src ${webview.cspSource} 'nonce-${nonce}';
style-src ${webview.cspSource};
```

`setDeferredScriptUris` 和 `addDeferredScriptUris` 会把 `media` 下浏览器可直接执行的 `.js` 文件作为外部脚本注入。TypeScript 需要先编译成 JavaScript。渲染前先调用 `setProps`，脚本里通过 `window.__WEBVIEW_PROPS__` 读取参数。

`setProps` 接收 JSON-serializable values。

运行时代码默认不会把 VS Code API 暴露到 `window`。可信的 webview 脚本可以直接调用 `acquireVsCodeApi()`。如果需要旧的全局 API，可以设置 `exposeVsCodeApi: true` 得到 `window.vscode`，也可以传安全 identifier，例如 `exposeVsCodeApi: 'editorApi'`。`document`、`location`、`__proto__` 等保留全局名称会被拒绝。启用 `exposeVsCodeApi` 后，业务脚本应使用 `window.vscode` 或配置的名称，不要再重复调用 `acquireVsCodeApi()`。

脚本加载行为：

| API | 适用场景 | CSP 处理 |
| --- | --- | --- |
| `scripts` | 外部本地路径或允许的远程 URL | 本地路径使用 webview 资源；远程 URL 需要 allowlist，除非使用自定义 `csp` |
| `deferScript` | 可信内联 JavaScript 源码 | scripts 启用时使用运行时 nonce 渲染 |
| `setDeferredScriptUris` / `addDeferredScriptUris` | `mediaRoot` 下浏览器可直接执行的本地 `.js` 文件 | 作为本地 webview resource script 渲染 |
| `createWithHTMLUrl` HTML 内的 `<script src>` | HTML 文件中已有的脚本 | 本地 `src` 会被重写；远程 `src` 交给 CSP 控制 |

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

Extension side:

```ts
await provider.postMessage({ type: 'init', payload: {} })
```

## 安全模型

`create(html)` 只接受可信 HTML。不要把未清洗的用户输入、workspace 文件内容、文件路径、设置或外部 API 数据直接拼进 HTML 字符串；动态内容需要先转义或清洗。

默认 CSP 从 `default-src 'none'` 开始，运行时内联脚本使用 nonce，本地资源默认通过 `localResourceRoots` 限制在扩展的 `media` 目录，除非你配置了其他 root。远程 scripts 和 styles 必须显式加入 allowlist。为了兼容性，图片和字体默认允许 `https:` 和 `data:`；需要更严格策略时使用 `strictCsp: true`。

除非显式开启 `exposeVsCodeApi`，运行时不会把 VS Code API 暴露到全局。

## 从 0.0.x 迁移

这个版本包含破坏性行为变化，发布时应该使用 `0.1.0`。

- `retainContextWhenHidden` 现在默认是 `false`。
- 远程 scripts 和 styles 必须通过 `allowedScriptSources`、`allowedStyleSources` 显式允许，除非传入自定义 `csp`。
- `scripts` 只接受路径和 URL。内联 JavaScript 请使用 `deferScript`。
- `deferScriptUri` 现在会从 `media` 注入外部脚本，不再读取文件并内联。新代码建议使用 `setDeferredScriptUris` 或 `addDeferredScriptUris`。
- props 现在通过 `window.__WEBVIEW_PROPS__` 读取，不再是 `webviewThis`。
- VS Code API 默认不再暴露为 `window.vscode`。在可信脚本里使用 `acquireVsCodeApi()`，或通过 `exposeVsCodeApi` 显式开启。

## Cases
- [vscode icones](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-icones)
- [vscode yesicone](https://marketplace.visualstudio.com/items?itemName=simonhe.vscode-yesicon)

## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>
