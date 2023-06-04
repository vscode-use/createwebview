## vscode-createwebview

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

- provider.isActive 检测当前 webview 是否已经打开
- create 创建 webview
- destory 销毁关闭 webview
- deferScript 默认 js 是加载在 body 的后面,deferScript 会在默认的 js 之后注入，并且为了解决一些默认数据渲染的问题，支持'<script>xxx</script>'

## License

[MIT](./LICENSE) License © 2022 [Simon He](https://github.com/Simon-He95)

<a href="https://github.com/Simon-He95/sponsor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>

<span><div align="center">![sponsors](https://www.hejian.club/images/sponsors.jpg)</div></span>
