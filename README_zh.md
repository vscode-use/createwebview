<p align="center">
<img src="./assets/kv.png" alt="vscode-use/createwebview">
</p>
<p align="center"> <a href="./README.md">English</a> | 简体中文</p>

> WIP: 这个库是为了快速在 vscode 插件中使用 webview 打开新 tab 页，让使用上更加简单

## Usage

```code
function activate(context: vscode.ExtensionContext) {
 const provider = new CreateWebview(
    context.extensionUri,
    'Daily planner', // webview打开的tab页标题
    ['https://unpkg.com/vue@2/dist/vue.js', 'https://unpkg.com/element-ui/lib/index.js'], // js文件引入，本地js需要配置在media目录下
    ['reset.css', 'https://unpkg.com/element-ui/lib/theme-chalk/index.css', 'main.css']) // css样式引入，本地css需要配置在media目录下
}

  const viewTodoDisposable = vscode.commands.registerCommand('extension.openWebview', () => {
    provider.create(`
    <div id="app">
      <div>Hello, World</div>
    </div>
    `, (data)=>{
      // callback 获取js层的postMessage数据
    })
  })
```

## Api

- provider.isActive ***检测当前 webview 是否已经打开***
- provider.create ***创建 webview***
- provider.destory ***销毁关闭 webview***
- provider.deferScript ***默认 js 是加载在 body 的后面,deferScript 会在默认的 js 之后注入，并且为了解决一些默认数据渲染的问题，支持'<script>xxx</script>'***
- provider.postMessage ***向js层发送消息***

## Feature
之前脚本使用字符串的方式插入体验不好,现在暴露了deferScriptUri的方式传入media下的.ts或者.js路径，就可以写js了，传惨需要提前通过setProps的方式，然后js中可以通过webviewThis获取到参数, webviewThis会在最终render被替换成setProps的参数

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

## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>

