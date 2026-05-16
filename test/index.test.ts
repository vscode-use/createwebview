import { beforeEach, describe, expect, it, vi } from 'vitest'

const vscodeMock = (() => {
  function createUri(path: string, query = '', fragment = '') {
    const uri = {
      path,
      fsPath: path,
      toString: () => `${path}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`,
    }
    Object.defineProperties(uri, {
      query: { value: query },
      fragment: { value: fragment },
      with: {
        value: (changes: { query?: string; fragment?: string }) => {
          return createUri(path, changes.query ?? query, changes.fragment ?? fragment)
        },
      },
    })
    return uri
  }

  const joinPath = vi.fn((base: any, ...parts: string[]) => {
    const path = [base.path, ...parts].join('/').replace(/\/+/g, '/').replace('/./', '/')
    return createUri(path)
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
    asWebviewUri: vi.fn((uri: any) => `webview:${uri.path}${uri.query ? `?${uri.query}` : ''}${uri.fragment ? `#${uri.fragment}` : ''}`),
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
    vscodeMock.window.createWebviewPanel.mockReset()
    vscodeMock.workspace.fs.readFile.mockReset()
    vscodeMock.Uri.joinPath.mockClear()
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
      allowedScriptSources: ['https://cdn.example.com'],
      allowedStyleSources: ['https://cdn.example.com'],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('<link href="webview:/extension/media/main.css" rel="stylesheet">')
    expect(html).toContain('<link href="https://cdn.example.com/theme.css" rel="stylesheet">')
    expect(html.indexOf('webview:/extension/media/pre.js')).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf('webview:/extension/media/post.js')).toBeLessThan(html.indexOf('</body>'))
    expect(html).toContain('<script src="https://cdn.example.com/app.js"></script>')
  })

  it('treats uppercase HTTPS URLs as external resources', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['HTTPS://cdn.example.com/app.js'],
      allowedScriptSources: ['https://cdn.example.com'],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('<script src="HTTPS://cdn.example.com/app.js"></script>')
    expect(html).not.toContain('webview:/extension/media/HTTPS:')
  })

  it('preserves query strings and fragments on local style and script paths', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['main.css?v=1#theme'],
      scripts: [
        { enforce: 'pre', src: 'pre.js?entry=head' },
        'post.js#app',
      ],
    })

    provider.deferScriptUri('deferred.js?v=2#boot')

    const html = await renderHtml(provider)

    expect(html).toContain('<link href="webview:/extension/media/main.css?v=1#theme" rel="stylesheet">')
    expect(html).toContain('<script src="webview:/extension/media/pre.js?entry=head"></script>')
    expect(html).toContain('<script src="webview:/extension/media/post.js#app"></script>')
    expect(html).toContain('<script src="webview:/extension/media/deferred.js?v=2#boot"></script>')
  })

  it('rejects external deferred script uris', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.deferScriptUri('https://cdn.example.com/app.js')

    await expect(renderHtml(provider)).rejects.toThrow('deferred script must be a path under the media directory: https://cdn.example.com/app.js')
  })

  it('rejects external resources that are not allowed by the default CSP', async () => {
    const { CreateWebview } = await import('../src/index')
    const scriptProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://evil.example/app.js'],
    })
    const styleProvider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['https://evil.example/app.css'],
    })

    await expect(renderHtml(scriptProvider)).rejects.toThrow('External script source is not allowed by CSP: https://evil.example/app.js')
    await expect(renderHtml(styleProvider)).rejects.toThrow('External style source is not allowed by CSP: https://evil.example/app.css')
  })

  it('rejects unsupported URI schemes in configured resources', async () => {
    const { CreateWebview } = await import('../src/index')
    const scriptProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['data:text/javascript,alert(1)'],
    })
    const styleProvider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['file:///tmp/theme.css'],
    })
    const deferredProvider = new CreateWebview(context as any, { title: 'Test' })
    deferredProvider.deferScriptUri('vscode:extension/app.js')

    await expect(renderHtml(scriptProvider)).rejects.toThrow('Unsupported script URI scheme: data:text/javascript,alert(1)')
    await expect(renderHtml(styleProvider)).rejects.toThrow('Unsupported style URI scheme: file:///tmp/theme.css')
    await expect(renderHtml(deferredProvider)).rejects.toThrow('Unsupported deferred script URI scheme: vscode:extension/app.js')
  })

  it('rejects protocol-relative configured resources', async () => {
    const { CreateWebview } = await import('../src/index')
    const scriptProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['//cdn.example.com/app.js'],
    })
    const styleProvider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['//cdn.example.com/theme.css'],
    })

    await expect(renderHtml(scriptProvider)).rejects.toThrow('Protocol-relative script URI is not supported')
    await expect(renderHtml(styleProvider)).rejects.toThrow('Protocol-relative style URI is not supported')
  })

  it('rejects raw script tags in scripts options', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['<script src="https://evil.example/app.js"></script>'],
    })

    await expect(renderHtml(provider)).rejects.toThrow('Use script paths/URLs in options.scripts; use deferScript for inline scripts.')
  })

  it('matches wildcard allowed sources only against their host suffix', async () => {
    const { CreateWebview } = await import('../src/index')
    const allowedProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://cdn.example.com/app.js'],
      allowedScriptSources: ['https://*.example.com'],
    })
    const rejectedProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://evil.com/app.js'],
      allowedScriptSources: ['https://*.example.com'],
    })

    await expect(renderHtml(allowedProvider)).resolves.toContain('src="https://cdn.example.com/app.js"')
    await expect(renderHtml(rejectedProvider)).rejects.toThrow('External script source is not allowed by CSP: https://evil.com/app.js')
  })

  it('rejects path traversal after normalizing external allowed sources', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://cdn.example.com/safe/../evil.js'],
      allowedScriptSources: ['https://cdn.example.com/safe'],
    })

    await expect(renderHtml(provider)).rejects.toThrow('External script source is not allowed by CSP: https://cdn.example.com/safe/../evil.js')
  })

  it('does not nonce allowed external script sources', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['https://cdn.example.com/app.js'],
      allowedScriptSources: ['https://cdn.example.com'],
    })

    const html = await renderHtml(provider)
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1]

    expect(html).toContain('src="https://cdn.example.com/app.js"')
    expect(html).not.toMatch(/<script nonce="[^"]+" src="https:\/\/cdn\.example/)
    expect(csp).toContain('https://cdn.example.com')
  })

  it('adds CSP meta and script nonces', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      allowedScriptSources: ['https://cdn.example.com'],
      allowedStyleSources: ['https://cdn.example.com'],
      allowedFontSources: ['https://fonts.example.com'],
      allowedConnectSources: ['https://api.example.com'],
      allowedMediaSources: ['https://media.example.com'],
      allowedFrameSources: ['https://frame.example.com'],
      allowedManifestSources: ['https://manifest.example.com'],
      allowedWorkerSources: ['https://worker.example.com'],
      allowedPrefetchSources: ['https://prefetch.example.com'],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain('default-src \'none\'')
    expect(html).toContain('base-uri \'none\'')
    expect(html).toContain('form-action \'none\'')
    expect(html).toContain('object-src \'none\'')
    expect(html).toContain('img-src vscode-resource: https: data:')
    expect(html).toContain('font-src vscode-resource: https: data: https://fonts.example.com')
    expect(html).toContain('connect-src vscode-resource: https://api.example.com')
    expect(html).toContain('style-src vscode-resource: https://cdn.example.com')
    expect(html).toContain('script-src \'nonce-')
    expect(html).toContain('media-src vscode-resource: https://media.example.com')
    expect(html).toContain('frame-src vscode-resource: https://frame.example.com')
    expect(html).toContain('manifest-src vscode-resource: https://manifest.example.com')
    expect(html).toContain('worker-src vscode-resource: https://worker.example.com')
    expect(html).toContain('prefetch-src vscode-resource: https://prefetch.example.com')
    expect(html).toContain('https://cdn.example.com')
    expect(html).not.toContain('unsafe-inline')
    expect(html).not.toContain('acquireVsCodeApi')
  })

  it('rejects invalid CSP source tokens in default CSP options', async () => {
    const { CreateWebview } = await import('../src/index')
    const invalidOptions = [
      ['allowedScriptSources', 'https://cdn.example.com; script-src *'],
      ['allowedStyleSources', 'https://cdn.example.com theme.css'],
      ['allowedImageSources', 'https://cdn.example.com"bad'],
      ['allowedFontSources', 'https://cdn.example.com<bad>'],
      ['allowedConnectSources', 'https://api.example.com>'],
      ['allowedMediaSources', 'https://media.example.com bad'],
      ['allowedFrameSources', 'https://frame.example.com;'],
      ['allowedManifestSources', 'https://manifest.example.com"bad'],
      ['allowedWorkerSources', 'https://worker.example.com<bad>'],
      ['allowedPrefetchSources', 'https://prefetch.example.com>'],
    ]

    for (const [optionName, source] of invalidOptions) {
      expect(() => new CreateWebview(context as any, {
        title: 'Test',
        [optionName]: [source],
      })).toThrow(`Invalid CSP source token in ${optionName}: ${source}`)
    }
  })

  it('exposes the VS Code API only when configured', async () => {
    const { CreateWebview } = await import('../src/index')
    const namedProvider = new CreateWebview(context as any, {
      title: 'Test',
      exposeVsCodeApi: 'editorApi',
    })
    const legacyProvider = new CreateWebview(context as any, {
      title: 'Test',
      exposeVsCodeApi: true,
    })

    const namedHtml = await renderHtml(namedProvider)
    const legacyHtml = await renderHtml(legacyProvider)

    expect(namedHtml).toMatch(/if \(!window\["editorApi"\]\)\s*window\["editorApi"\] = acquireVsCodeApi\(\);/)
    expect(legacyHtml).toMatch(/if \(!window\["vscode"\]\)\s*window\["vscode"\] = acquireVsCodeApi\(\);/)
  })

  it('does not inject scripts when enableScripts is false', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      enableScripts: false,
      exposeVsCodeApi: true,
      styles: ['main.css'],
      scripts: [
        { enforce: 'pre', src: 'pre.js' },
        'post.js',
      ],
    })

    provider.setProps({ name: 'Ada' })
    provider.deferScript('window.inline = true')
    provider.deferScriptUri('deferred.js')
    const html = await renderHtml(provider)

    expect(html).toContain('<link href="webview:/extension/media/main.css" rel="stylesheet">')
    expect(html).not.toContain('<script')
    expect(html).toContain('script-src \'none\'')
    expect(html).toContain('worker-src \'none\'')
    expect(html).not.toContain('script-src \'nonce-')
    expect(html).not.toContain('acquireVsCodeApi')
    expect(html).not.toContain('window.__WEBVIEW_PROPS__')
    expect(html).not.toContain('window.inline = true')
    expect(html).not.toContain('webview:/extension/media/deferred.js')
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

  it('escapes generated html attributes', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      csp: 'script-src "bad" <bad> &',
      styles: ['https://cdn.example.com/theme"bad.css'],
      scripts: ['https://cdn.example.com/app"bad.js'],
    })

    const html = await renderHtml(provider)

    expect(html).toContain('content="script-src &quot;bad&quot; &lt;bad&gt; &amp;"')
    expect(html).toContain('href="https://cdn.example.com/theme&quot;bad.css"')
    expect(html).toContain('src="https://cdn.example.com/app&quot;bad.js"')
    expect(html).not.toContain('content="script-src "bad"')
  })

  it('escapes generated html title text', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, {
      title: 'A <B> & C',
    })

    const html = await renderHtml(provider)

    expect(html).toContain('<title>A &lt;B&gt; &amp; C</title>')
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

  it('registers message handlers before assigning html', async () => {
    const { CreateWebview } = await import('../src/index')
    const createPanelView = createPanel()
    const htmlUrlPanelView = createPanel()
    const createOrder: string[] = []
    const htmlUrlOrder: string[] = []
    let createHtml = ''
    let htmlUrlHtml = ''

    Object.defineProperty(createPanelView.webview, 'html', {
      get: () => createHtml,
      set: (value) => {
        createOrder.push('html')
        createHtml = value
      },
    })
    Object.defineProperty(htmlUrlPanelView.webview, 'html', {
      get: () => htmlUrlHtml,
      set: (value) => {
        htmlUrlOrder.push('html')
        htmlUrlHtml = value
      },
    })
    createPanelView.webview.onDidReceiveMessage = vi.fn(() => {
      createOrder.push('message')
    })
    htmlUrlPanelView.webview.onDidReceiveMessage = vi.fn(() => {
      htmlUrlOrder.push('message')
    })
    vscodeMock.window.createWebviewPanel
      .mockReturnValueOnce(createPanelView)
      .mockReturnValueOnce(htmlUrlPanelView)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('<html><head></head><body></body></html>'))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.create('<div>inline</div>')
    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(createOrder).toEqual(['message', 'html'])
    expect(htmlUrlOrder).toEqual(['message', 'html'])
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

  it('keeps the newest create call when renders finish out of order', async () => {
    const { CreateWebview } = await import('../src/index')
    const firstPanel = createPanel()
    const secondPanel = createPanel()
    let resolveFirst!: (html: string) => void
    let resolveSecond!: (html: string) => void
    const firstRender = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const secondRender = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    vscodeMock.window.createWebviewPanel
      .mockReturnValueOnce(firstPanel)
      .mockReturnValueOnce(secondPanel)
    const provider = new CreateWebview(context as any, { title: 'Test' })
    ;(provider as any)._getHtmlForWebview = vi.fn()
      .mockReturnValueOnce(firstRender)
      .mockReturnValueOnce(secondRender)

    const firstCreate = provider.create('<div>one</div>')
    const secondCreate = provider.create('<div>two</div>')
    resolveSecond('<div>two</div>')
    await secondCreate
    resolveFirst('<div>one</div>')
    await firstCreate

    expect(firstPanel.dispose).toHaveBeenCalledTimes(1)
    expect(secondPanel.dispose).not.toHaveBeenCalled()
    await expect(provider.postMessage({ ok: true })).resolves.toBe(true)
    expect(secondPanel.webview.postMessage).toHaveBeenCalledWith({ ok: true })
  })

  it('keeps the newest createWithHTMLUrl call when renders finish out of order', async () => {
    const { CreateWebview } = await import('../src/index')
    const firstPanel = createPanel()
    const secondPanel = createPanel()
    let resolveFirst!: (content: { head: string; bodyEnd: string }) => void
    let resolveSecond!: (content: { head: string; bodyEnd: string }) => void
    let markFirstStarted!: () => void
    let markSecondStarted!: () => void
    const firstRender = new Promise<{ head: string; bodyEnd: string }>((resolve) => {
      resolveFirst = resolve
    })
    const secondRender = new Promise<{ head: string; bodyEnd: string }>((resolve) => {
      resolveSecond = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const secondStarted = new Promise<void>((resolve) => {
      markSecondStarted = resolve
    })
    vscodeMock.window.createWebviewPanel
      .mockReturnValueOnce(firstPanel)
      .mockReturnValueOnce(secondPanel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('<html><head></head><body></body></html>'))
    const provider = new CreateWebview(context as any, { title: 'Test' })
    ;(provider as any)._getWebviewContent = vi.fn()
      .mockImplementationOnce(() => {
        markFirstStarted()
        return firstRender
      })
      .mockImplementationOnce(() => {
        markSecondStarted()
        return secondRender
      })

    const firstCreate = provider.createWithHTMLUrl('./src/webview/one.html')
    await firstStarted
    const secondCreate = provider.createWithHTMLUrl('./src/webview/two.html')
    await secondStarted
    resolveSecond({ head: '<meta name="second">', bodyEnd: '<script>second</script>' })
    await secondCreate
    resolveFirst({ head: '<meta name="first">', bodyEnd: '<script>first</script>' })
    await firstCreate

    expect(firstPanel.dispose).toHaveBeenCalledTimes(1)
    expect(secondPanel.dispose).not.toHaveBeenCalled()
    expect(secondPanel.webview.html).toContain('<meta name="second">')
    expect(secondPanel.webview.html).toContain('<script>second</script>')
    expect(secondPanel.webview.html).not.toContain('<meta name="first">')
    await expect(provider.postMessage({ ok: true })).resolves.toBe(true)
    expect(secondPanel.webview.postMessage).toHaveBeenCalledWith({ ok: true })
  })

  it('ignores stale createWithHTMLUrl reads before CSP validation', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    let resolveFirst!: (bytes: Buffer) => void
    const firstRead = new Promise<Buffer>((resolve) => {
      resolveFirst = resolve
    })
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile
      .mockReturnValueOnce(firstRead)
      .mockResolvedValueOnce(Buffer.from('<html><head></head><body>new</body></html>'))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    const firstCreate = provider.createWithHTMLUrl('./src/webview/old.html')
    const secondCreate = provider.createWithHTMLUrl('./src/webview/new.html')
    await secondCreate
    resolveFirst(Buffer.from(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src none"></head><body>old</body></html>',
    ))
    await firstCreate

    expect(vscodeMock.window.createWebviewPanel).toHaveBeenCalledTimes(1)
    expect(panel.webview.html).toContain('new')
    expect(panel.webview.html).not.toContain('old')
  })

  it('destroy cancels pending createWithHTMLUrl reads', async () => {
    const { CreateWebview } = await import('../src/index')
    let resolveRead!: (bytes: Buffer) => void
    const read = new Promise<Buffer>((resolve) => {
      resolveRead = resolve
    })
    vscodeMock.workspace.fs.readFile.mockReturnValue(read)
    const provider = new CreateWebview(context as any, { title: 'Test' })

    const create = provider.createWithHTMLUrl('./src/webview/index.html')
    provider.destroy()
    resolveRead(Buffer.from('<html><head></head><body>slow</body></html>'))
    await create

    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
    await expect(provider.postMessage({ ok: true })).resolves.toBe(false)
  })

  it('destroy ignores pending createWithHTMLUrl read failures', async () => {
    const { CreateWebview } = await import('../src/index')
    let rejectRead!: (error: Error) => void
    const read = new Promise<Buffer>((_resolve, reject) => {
      rejectRead = reject
    })
    vscodeMock.workspace.fs.readFile.mockReturnValue(read)
    const provider = new CreateWebview(context as any, { title: 'Test' })

    const create = provider.createWithHTMLUrl('./src/webview/index.html')
    provider.destroy()
    rejectRead(new Error('read failed'))
    await expect(create).resolves.toBeUndefined()

    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('destroy cancels pending create renders', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    let resolveRender!: (html: string) => void
    const render = new Promise<string>((resolve) => {
      resolveRender = resolve
    })
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    const provider = new CreateWebview(context as any, { title: 'Test' })
    ;(provider as any)._getHtmlForWebview = vi.fn().mockReturnValue(render)

    const create = provider.create('<div>slow</div>')
    provider.destroy()
    resolveRender('<div>slow</div>')
    await create

    expect(panel.dispose).toHaveBeenCalledTimes(1)
    await expect(provider.postMessage({ ok: true })).resolves.toBe(false)
    expect(panel.webview.postMessage).not.toHaveBeenCalled()
  })

  it('destroy ignores pending create render failures', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    let rejectRender!: (error: Error) => void
    const render = new Promise<string>((_resolve, reject) => {
      rejectRender = reject
    })
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    const provider = new CreateWebview(context as any, { title: 'Test' })
    ;(provider as any)._getHtmlForWebview = vi.fn().mockReturnValue(render)

    const create = provider.create('<div>slow</div>')
    provider.destroy()
    rejectRender(new Error('render failed'))
    await expect(create).resolves.toBeUndefined()

    expect(panel.dispose).toHaveBeenCalledTimes(1)
    await expect(provider.postMessage({ ok: true })).resolves.toBe(false)
  })

  it('keeps the previous panel when create rendering fails', async () => {
    const { CreateWebview } = await import('../src/index')
    const oldPanel = createPanel()
    const newPanel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(newPanel)
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['../secret.js'],
    })
    ;(provider as any).webviewView = oldPanel

    await expect(provider.create()).rejects.toThrow('Invalid media path: ../secret.js')

    expect(newPanel.dispose).toHaveBeenCalledTimes(1)
    expect(oldPanel.dispose).not.toHaveBeenCalled()
    await expect(provider.postMessage({ ok: true })).resolves.toBe(true)
    expect(oldPanel.webview.postMessage).toHaveBeenCalledWith({ ok: true })
  })

  it('keeps the previous panel when createWithHTMLUrl rendering fails', async () => {
    const { CreateWebview } = await import('../src/index')
    const oldPanel = createPanel()
    const newPanel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(newPanel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('<html><head></head><body></body></html>'))
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      styles: ['../secret.css'],
    })
    ;(provider as any).webviewView = oldPanel

    await expect(provider.createWithHTMLUrl('./src/webview/index.html')).rejects.toThrow('Invalid media path: ../secret.css')

    expect(newPanel.dispose).toHaveBeenCalledTimes(1)
    expect(oldPanel.dispose).not.toHaveBeenCalled()
    await expect(provider.postMessage({ ok: true })).resolves.toBe(true)
    expect(oldPanel.webview.postMessage).toHaveBeenCalledWith({ ok: true })
  })

  it('renders deferred script uris as webview script tags', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.setProps({ name: 'Ada' })
    provider.deferScriptUri('app.js')

    const html = await renderHtml(provider)

    expect(vscodeMock.workspace.fs.readFile).not.toHaveBeenCalled()
    expect(html).toContain('window.__WEBVIEW_PROPS__ = {"name":"Ada"}')
    expect(html).toContain('<script src="webview:/extension/media/app.js"></script>')
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

  it('rejects media paths with backslash or encoded parent directory segments', async () => {
    const { CreateWebview } = await import('../src/index')
    const backslashProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['..\\secret.js'],
    })
    const encodedProvider = new CreateWebview(context as any, {
      title: 'Test',
      scripts: ['%2e%2e/secret.js'],
    })

    await expect(renderHtml(backslashProvider)).rejects.toThrow('Invalid media path: ..\\secret.js')
    await expect(renderHtml(encodedProvider)).rejects.toThrow('Invalid media path: %2e%2e/secret.js')
  })

  it('loads html urls through vscode workspace fs and injects runtime CSP', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head></head><body><img src="./icon.png"><script src="/app.js"></script><script src="//cdn.example.com/app.js"></script></body></html>',
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
    expect(panel.webview.html).not.toContain('acquireVsCodeApi')
    expect(panel.webview.html).toContain('window.__WEBVIEW_PROPS__ = {"name":"Ada"}')
    expect(panel.webview.html).toContain('src="webview:/extension/media/icon.png"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/app.js"')
    expect(panel.webview.html).toContain('src="//cdn.example.com/app.js"')
    expect(panel.webview.html).not.toContain('webview:/extension/media/cdn.example.com')
  })

  it('rewrites only resource-bearing html url attributes', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><base href="/"><link rel="canonical" href="/page"><link rel="stylesheet" href="./main.css"></head><body><a href="/settings">Settings</a><form action="/submit"></form><img src="./icon.png"><script src="/app.js"></script></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toContain('<base href="/">')
    expect(panel.webview.html).toContain('<link rel="canonical" href="/page">')
    expect(panel.webview.html).toContain('<a href="/settings">Settings</a>')
    expect(panel.webview.html).toContain('<form action="/submit"></form>')
    expect(panel.webview.html).toContain('href="webview:/extension/media/main.css"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/icon.png"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/app.js"')
  })

  it('preserves query strings and fragments when rewriting html url resources', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><link href="./main.css?v=1#theme" rel="stylesheet"></head><body><img src="./icon.svg#logo"><script src="/app.js?entry=main#boot"></script></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toContain('href="webview:/extension/media/main.css?v=1#theme"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/icon.svg#logo"')
    expect(panel.webview.html).toContain('src="webview:/extension/media/app.js?entry=main#boot"')
  })

  it('rejects html urls containing parent directory segments', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await expect(provider.createWithHTMLUrl('../outside.html')).rejects.toThrow('Invalid extension file path: ../outside.html')
    await expect(provider.createWithHTMLUrl('..\\outside.html')).rejects.toThrow('Invalid extension file path: ..\\outside.html')
    await expect(provider.createWithHTMLUrl('%2e%2e/outside.html')).rejects.toThrow('Invalid extension file path: %2e%2e/outside.html')
    expect(vscodeMock.workspace.fs.readFile).not.toHaveBeenCalled()
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('rejects html urls with URL-like inputs', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })
    const htmlUrls = [
      'file:///tmp/index.html',
      'http://example.com/index.html',
      'C:\\tmp\\index.html',
      '//cdn.example.com/index.html',
    ]

    for (const htmlUrl of htmlUrls)
      await expect(provider.createWithHTMLUrl(htmlUrl)).rejects.toThrow(`HTML URL must be a relative extension path: ${htmlUrl}`)

    expect(vscodeMock.workspace.fs.readFile).not.toHaveBeenCalled()
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('rejects html urls with an existing CSP meta', async () => {
    const { CreateWebview } = await import('../src/index')
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src none"></head><body></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await expect(provider.createWithHTMLUrl('./src/webview/index.html')).rejects.toThrow('createWithHTMLUrl received HTML with an existing CSP meta. Remove it before rendering.')
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('rejects html urls with CSP meta using whitespace, reordered, or unquoted attributes', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })
    const htmlCases = [
      '<meta http-equiv = "Content-Security-Policy" content="default-src none">',
      '<meta content="default-src none" http-equiv=\'content-security-policy\'>',
      '<meta http-equiv=Content-Security-Policy content="default-src none">',
    ]

    for (const html of htmlCases) {
      vscodeMock.workspace.fs.readFile.mockResolvedValueOnce(Buffer.from(html))

      await expect(provider.createWithHTMLUrl('./src/webview/index.html')).rejects.toThrow('createWithHTMLUrl received HTML with an existing CSP meta. Remove it before rendering.')
    }
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('replaces existing html url CSP meta when configured', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><meta http-equiv="Content-Security-Policy" content="script-src https://old.example"><script src="./app.js"></script></head><body></body></html>',
    ))
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      existingCsp: 'replace',
    })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).not.toContain('https://old.example')
    expect(panel.webview.html.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
    expect(panel.webview.html).toContain('webview:/extension/media/app.js')
  })

  it('rejects legacy preserve mode for existing html url CSP meta', async () => {
    const { CreateWebview } = await import('../src/index')
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><meta http-equiv="Content-Security-Policy" content="script-src https://existing.example"><script src="./app.js"></script></head><body></body></html>',
    ))
    const provider = new CreateWebview(context as any, {
      title: 'Test',
      existingCsp: 'preserve' as any,
    })

    await expect(provider.createWithHTMLUrl('./src/webview/index.html')).rejects.toThrow('createWithHTMLUrl received HTML with an existing CSP meta. Remove it before rendering.')
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled()
  })

  it('injects html url CSP before existing head resources', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head><script src="./head.js"></script><link href="./head.css" rel="stylesheet"></head><body></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(panel.webview.html.indexOf('webview:/extension/media/head.js'))
    expect(panel.webview.html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(panel.webview.html.indexOf('webview:/extension/media/head.css'))
  })

  it('adds a head element when html urls omit head', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><body><div id="app"></div></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toMatch(/<html>\s*<head>\s*<meta http-equiv="Content-Security-Policy"/)
    expect(panel.webview.html.indexOf('<head>')).toBeGreaterThan(panel.webview.html.indexOf('<html>'))
    expect(panel.webview.html.indexOf('</head>')).toBeLessThan(panel.webview.html.indexOf('<body>'))
  })

  it('adds a head element after doctype when html urls omit html and head', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<!doctype html>\n<body><div id="app"></div></body>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toMatch(/^<!doctype html>\s*<html>\s*<head>\s*<meta http-equiv="Content-Security-Policy"/)
    expect(panel.webview.html.indexOf('<html>')).toBeGreaterThan(panel.webview.html.indexOf('<!doctype html>'))
    expect(panel.webview.html.indexOf('<head>')).toBeLessThan(panel.webview.html.indexOf('<body>'))
  })

  it('applies configured styles and scripts when loading html urls', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from('<html><head></head><body><div id="app"></div></body></html>'))
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
    expect(panel.webview.html.indexOf('webview:/extension/media/deferred.js')).toBeLessThan(panel.webview.html.indexOf('</body>'))
  })

  it('does not treat $ sequences in injected body content as replacement tokens', async () => {
    const { CreateWebview } = await import('../src/index')
    const panel = createPanel()
    vscodeMock.window.createWebviewPanel.mockReturnValue(panel)
    vscodeMock.workspace.fs.readFile.mockResolvedValue(Buffer.from(
      '<html><head></head><body><div id="app"></div></body></html>',
    ))
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.deferScript('const value = "$& $1 $$"')
    await provider.createWithHTMLUrl('./src/webview/index.html')

    expect(panel.webview.html).toContain('const value = "$& $1 $$"')
  })

  it('escapes closing script tags in deferred JavaScript source', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.deferScript('const html = "</script><img src=x onerror=alert(1)>"')

    const html = await renderHtml(provider)

    expect(html).toContain('const html = "<\\/script><img src=x onerror=alert(1)>"')
    expect(html).not.toContain('const html = "</script><img src=x onerror=alert(1)>"')
  })

  it('rejects deferred inline script wrappers', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.deferScript('<script>window.inline = true</script>')

    await expect(renderHtml(provider)).rejects.toThrow('deferScript accepts JavaScript source only. Use deferScriptUri or options.scripts for script files.')
  })

  it('rejects uppercase deferred inline script wrappers', async () => {
    const { CreateWebview } = await import('../src/index')
    const provider = new CreateWebview(context as any, { title: 'Test' })

    provider.deferScript('<SCRIPT>window.inline = true</SCRIPT>')

    await expect(renderHtml(provider)).rejects.toThrow('deferScript accepts JavaScript source only. Use deferScriptUri or options.scripts for script files.')
  })
})
