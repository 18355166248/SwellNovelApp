windows 下是

set GEMINI_API_KEY="YOUR_API_KEY"
然后就可以玩 gemini 了，不过我第一次进入的时候，一直报这个错误 ：

[API Error: exception TypeError: fetch failed sending request]

可是我的明明有代理啊，我将代理设置为全局拦截都没用，后来发现是 power shell 需要做以下设置，敲入以下两条命令：

$env:HTTP_PROXY = "http://127.0.0.1:33210"
$env:HTTPS_PROXY = "http://127.0.0.1:33210"
