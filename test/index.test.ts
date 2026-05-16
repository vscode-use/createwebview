import { beforeEach, describe, expect, it, vi } from 'vitest'

const vscodeMock = (() => {
  const joinPath = vi.fn((base: any, ...parts: string[]) => {
    const path = [base.path, ...parts].join('/').replace(/\/+/g, '/').replace('/./', '/')
    return {
      path,
      fsPath: path,
      toString: () => path,
    }
  })

  return {
    Uri: {
      joinPath,
    },
    ViewColumn: {
      One: 1,
    },
    window: {
      createWebviewPanel: vi.fn(),
    },
    workspace: {
      fs: {
        readFile: vi.fn(),
      },
    },
  }
})()

const extensionUri = {
  path: '/extension',
  fsPath: '/extension',
}

const context = {
  extensionUri,
  extensionPath: '/extension',
}

function createWebview() {
  return {
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: vi.fn((uri: any) => `webview:${uri.path}`),
    onDidReceiveMessage: vi.fn(),
    postMessage: vi.fn(async () => true),
  }
}

function createPanel() {
  const disposeHandlers: Array<() => void> = []
  const panel = {
    active: true,
    webview: createWebview(),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler)
      return { dispose: vi.fn() }
    }),
    dispose: vi.fn(() => {
      disposeHandlers.forEach(handler => handler())
    }),
  }

  return panel
}

async function renderHtml(provider: any, webview = createWebview()) {
  return provider._getHtmlForWebview(webview, '<main></main>')
}

describe('CreateWebview', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('vscode', () => vscodeMock)
  })

  it('does not inject an empty script when scripts is omitted', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(extensionUri as any, { title: 'Test' })
    const webview = createWebview()

    const html = await renderHtml(provider, webview)

    expect(webview.asWebviewUri).not.toHaveBeenCalled()
    expect(html).not.toContain('<script src=')
  })

  it('converts local style and script paths to webview uris', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['main.css', 'https://cdn.example.com/theme.css'],
      scripts: [
        { enforce: 'pre', src: 'pre.js' },
        'post.js',
        'https://cdn.example.com/app.js',
      ],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('<link href="webview:/extension/media/main.css" rel="stylesheet">')
    expect(html).toContain('<link href="https://cdn.example.com/theme.css" rel="stylesheet">')
    expect(html.indexOf('webview:/extension/media/pre.js')).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf('webview:/extension/media/post.js')).toBeGreaterThan(html.indexOf('</body>'))
    expect(html).toContain('<script src="https://cdn.example.com/app.js"></script>')
  })

  it('does not nonce external script sources', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://evil.example/app.js'],
    })

    const html = await renderHtml(provider)
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1]

    expect(html).toContain('src="https://evil.example/app.js"')
    expect(html).not.toMatch(/<script nonce="[^"]+" src="https:\/\/evil\.example/)
    expect(csp).not.toContain('https://evil.example')
  })

  it('adds CSP meta and script nonces', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      allowedScriptSources: ['https://cdn.example.com'],
      allowedStyleSources: ['https://cdn.example.com'],
      allowedFontSources: ['https://fonts.example.com'],
      allowedConnectSources: ['https://api.example.com'],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain('default-src \'none\'')
    expect(html).toContain('img-src vscode-resource: https: data:')
    expect(html).toContain('font-src vscode-resource: https: data: https://fonts.example.com')
    expect(html).toContain('connect-src vscode-resource: https://api.example.com')
    expect(html).toContain('style-src vscode-resource: https://cdn.example.com')
    expect(html).toContain('script-src \'nonce-')
    expect(html).toContain('https://cdn.example.com')
    expect(html).not.toContain('unsafe-inline')
    expect(html).toMatch(/<script nonce="[^"]+">\s*window\.vscode = acquireVsCodeApi\(\);/)
  })

  it('replaces custom CSP placeholders', async () => {
    const { CreateWebview } = await import('../src/index')
    const cspSourcePlaceholder = ['$', '{webview.cspSource}'].join('')
    const noncePlaceholder = ['$', '{nonce}'].join('')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      csp: `script-src ${cspSourcePlaceholder} 'nonce-${noncePlaceholder}'`,
    })

    const html = await renderHtml(provider)

    expect(html).toContain('script-src vscode-resource: \'nonce-')
    expect(html).not.toContain(cspSourcePlaceholder)
    expect(html).not.toContain(noncePlaceholder)
  })

  it('uses safer panel defaults', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    const provider = new CreateWebview(context as any, {
      viewType: 'testView',
      title: 'Test',
      html: '<div>default</div>',
    })

    await provider.create()

    expect(vscodeMock.window.createWebviewPanel).toHaveBeenCalledWith(
      'testView',
      'Test',
      1,
      {
        enableScripts: true,
        localResourceRoots: [{
          path: '/extension/media',
          fsPath: '/extension/media',
          toString: expect.any(Function),
        }],
        retainContextWhenHidden: false,
      },
    )
    expect(panel.webview.html).toContain('<div>default</div>')
  })

  it('disposes the previous panel and clears panel state on dispose', async () => {
    const { CreateWebview } = await import('../src/index')
    const firstPanel = createPanel()
    const secondPanel = createPanel()
    vscodeMock.window.createWebviewPanel
      .mockReturnValueOnce(firstPanel)
      .mockReturnValueOnce(secondPanel)
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.create('<div>one</div>')
    await provider.create('<div>two</div>')

    expect(firstPanel.dispose).toHaveBeenCalledTimes(1)
    await expect(provider.postMessage({ ok: true })).resolves.toBe(true)
    expect(secondPanel.webview.postMessage).toHaveBeenCalledWith({ ok: true })

    secondPanel.dispose()

    await expect(provider.postMessage({ ok: false })).resolves.toBe(false)
  })

  it('reads deferred script uris through vscode workspace fs', async () => {
    const { CreateWebview } = await import('../src/index')
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('const props = window.__WEBVIEW_PROPS__'))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.setProps({ name: 'Ada' })
    provider.deferScriptUri('app.js')

    const html = await renderHtml(provider)

    expect(vscodeMock.workspace.fs.readFile).toHaveBeenCalledWith({
      path: '/extension/media/app.js',
      fsPath: '/extension/media/app.js',
      toString: expect.any(Function),
    })
    expect(html).toContain('window.__WEBVIEW_PROPS__ = {"name":"Ada"}')
    expect(html).toContain('const props = window.__WEBVIEW_PROPS__')
  })

  it('escapes props before injecting them into inline scripts', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.setProps({ payload: '</script><script>alert(1)</script>' })

    const html = await renderHtml(provider)

    expect(html).not.toContain('</script><script>alert(1)</script>')
    expect(html).toContain('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e')
  })

  it('escapes props in html url runtime injection', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('<html><head></head><body></body></html>'))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.setProps({ payload: '</script><script>alert(1)</script>' })
    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).not.toContain('</script><script>alert(1)</script>')
    expect(panel.webview.html).toContain('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e')
  })

  it('rejects media paths containing parent directory segments', async () => {
    const { CreateWebview } = await import('../src/index')
    const scriptProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['../secret.js'],
    })
    const styleProvider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['../../secret.css'],
    })
    const deferredProvider = new CreateWebview(context as any, { title: 'Test' })

    await expect(renderHtml(scriptProvider)).rejects.toThrow('Invalid media path: ../secret.js')
    await expect(renderHtml(styleProvider)).rejects.toThrow('Invalid media path: ../../secret.css')

    deferredProvider.deferScriptUri('../secret.js')
    await expect(renderHtml(deferredProvider)).rejects.toThrow('Invalid media path: ../secret.js')
  })

  it('loads html urls through vscode workspace fs and injects runtime CSP', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head></head><body><img src="./icon.png"><script src="/app.js"></script></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.setProps({ name: 'Ada' })
    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(vscodeMock.workspace.fs.readFile).toHaveBeenCalledWith({
      path: '/extension/src/webview/index.html',
      fsPath: '/extension/src/webview/index.html',
      toString: expect.any(Function),
    })
    expect(panel.webview.html).toContain('http-equiv="Content-Security-Policy"')
    expect(panel.webview.html).toMatch(/<script nonce="[^"]+">\s*window\.vscode = acquireVsCodeApi\(\);/)
    expect(panel.webview.html).toContain('window.__WEBVIEW_PROPS__ = {"name":"Ada"}')
    expect(panel.webview.html).toContain('src="webview:/extension/media/icon.png"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/app.js"')
  })

  it('applies configured styles and scripts when loading html urls', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockImplementation(async (uri: any) => {
      if (uri.path === '/extension/media/deferred.js')
        return Buffer.from('window.deferred = true')

      return Buffer.from('<html><head></head><body><div id="app"></div></body></html>')
    })
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['main.css'],
      scripts: [
        { enforce: 'pre', src: 'pre.js' },
        'post.js',
      ],
    })

    provider.deferScript('window.inline = true')
    provider.deferScriptUri('deferred.js')
    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toContain('<link href="webview:/extension/media/main.css" rel="stylesheet">')
    expect(panel.webview.html.indexOf('webview:/extension/media/pre.js')).toBeLessThan(panel.webview.html.indexOf('</head>'))
    expect(panel.webview.html.indexOf('webview:/extension/media/post.js')).toBeLessThan(panel.webview.html.indexOf('</body>'))
    expect(panel.webview.html.indexOf('window.inline = true')).toBeLessThan(panel.webview.html.indexOf('</body>'))
    expect(panel.webview.html.indexOf('window.deferred = true')).toBeLessThan(panel.webview.html.indexOf('</body>'))
  })
})
