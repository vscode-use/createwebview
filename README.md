<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> English | <a href="./README_zh.md">简体中文</a></p>

Let you create a webview vscode plug-in in 1 minute

## Install

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
      // callback Get the post message data of the js layer
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
    // Relative path based on the root directory
    // The local path resource (href="" | src="") in html needs to use the relative path and put it under the media folder in the root directory.
    await provider.createWithHTMLUrl('./src/webview/index.html', (data) => {
      // callback Get the post message data of the js layer
    })
  })

  context.subscriptions.push(viewTodoDisposable)
}
```

## Api

- provider.isActive ***Checks whether the current webview is open***
- provider.create ***Create a webview***
- provider.createWithHTMLUrl ***Create a webview from an HTML file***
- provider.destroy ***Destroy Close the webview***
- provider.destory ***Deprecated alias of destroy***
- provider.deferScript ***The default js is loaded at the back of the body,defer script is injected after the default js, and in order to solve some problems with default data rendering, support is supported'<script>xxx</script>'***
- provider.deferScriptUri ***Load a deferred script from the media directory***
- provider.setProps ***Set props available as window.__WEBVIEW_PROPS__ in deferred scripts***
- provider.postMessage ***Send a message to the js layer***

## Feature

Local scripts and styles are resolved from the extension `media` directory. Webviews include a default CSP, so remote script/style sources must be listed explicitly with `allowedScriptSources` and `allowedStyleSources`, or replaced by a custom `csp`. Font sources allow VS Code webview resources, `https:`, and `data:` by default; add extra font/connect sources with `allowedFontSources` and `allowedConnectSources`.

`deferScriptUri` can load a browser-ready `.js` file under `media`. Compile TypeScript before loading it. Call `setProps` before rendering, then read the values from `window.__WEBVIEW_PROPS__`.

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
