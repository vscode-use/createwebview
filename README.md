<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> English | <a href="./README_zh.md">简体中文</a></p>

Let you create a webview vscode plug-in in 1 minute

## Install
```
npm i @vscode-use/createwebview
```

## Usage

```code
function activate(context: vscode.ExtensionContext) {
 const provider = new CreateWebview(
    context.extensionUri,
    {
      title: 'Daily planner', // The title of the tab page opened by webview
      scripts: ['https://unpkg.com/vue@2/dist/vue.js', 'https://unpkg.com/element-ui/lib/index.js'], // The local js file needs to be configured 
      styles: ['reset.css', 'https://unpkg.com/element-ui/lib/theme-chalk/index.css', 'main.css']
    }
  ) // When the css style is imported, the local css must be configured in the media directory
}
  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', () => {
    provider.create(`
    <div id="app">
      <div>Hello, World</div>
    </div>
    `, (data)=>{
      // callback Get the post message data of the js layer
    })
  })
```

## Api

- provider.isActive ***Checks whether the current webview is open***
- provider.create ***Create a webview***
- provider.destory ***Destroy Close the webview***
- provider.deferScript ***The default js is loaded at the back of the body,defer script is injected after the default js, and in order to solve some problems with default data rendering, support is supported'<script>xxx</script>'***
- provider.postMessage ***Send a message to the js layer***

## Feature
Previously, the script used the string method to insert the bad experience, now exposed the defer script uri method to pass the.ts or.js path under the media, so you can write js, and you need to pass the set props method in advance. js can then get the parameters via webview this, webview this will be replaced with the parameters of set props in the final render

```code
const vscode = acquireVsCodeApi()
const { name, age } = webviewThis
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

