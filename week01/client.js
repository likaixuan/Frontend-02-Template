
const net = require('net')
class Request {
  constructor(options) {
    this.method = options.method || "GET"
    this.host = options.host 
    this.port = options.port || 80
    this.path = options.path || "/"
    this.body = options.body || {}
    this.headers = options.headers || {}

    // 设置默认content-type 类型
    if(!this.headers["Content-Type"]) {
      this.headers["Content-Type"] = "application/x-www-form-urlencoded"
    }  

    if(this.headers["Content-Type"] === "application/json") {
     
      this.bodyText = JSON.stringify(this.body)
    } else if(this.headers["Content-Type"] === "application/x-www-form-urlencoded"){
      this.bodyText = Object.keys(this.body).map((key)=>{
        return `${key}=${encodeURIComponent(this.body[key])}`
      }).join('&')
    }

    this.headers["Content-length"] = this.bodyText.length
  }
  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r
${Object.keys(this.headers).map((key)=>{
  return `${key}: ${this.headers[key]}`
}).join('\r\n')}\r
\r
${this.bodyText}`
  }

  send(connection) {
    return new Promise((resovle,reject)=>{
      const parser = new ResponseParser
      if(connection) {
        connection.write(this.toString())
      } else {
        connection = net.createConnection({
          host:this.host,
          port:this.port 
        },()=>{
          console.log('发送的请求',this.toString())
          connection.write(this.toString())
        })
      }

      connection.on('data',(data)=>{
        parser.receive(data.toString())
        if(parser.isFinished) {
          resovle(parser.response)
          connection.end()
        }
      })

      connection.on('error',(err)=>{
        reject(err)
        connection.end()
      })
    }) 

   

    
  }
}

class ResponseParser {
  constructor() {
    this.WAITING_STATUS_LINE = 0 
    this.WAITING_STATUS_LINE_END = 1
    this.WAITING_HEADER_NAME = 2
    this.WAITING_HEADER_SPACE = 3 
    this.WAITING_HEADER_VALUE = 4
    this.WAITING_HEADER_LINE_END = 5
    this.WAITING_HEADER_BLOCK_END = 6
    this.WAITING_BODY = 7

    this.current = this.WAITING_STATUS_LINE
    this.statusLine = ''
    this.headers = {}
    this.headerName = ''
    this.headerValue = ''
    this.bodyParser = null 


  }

  get isFinished() {
    return this.bodyParser && this.bodyParser.isFinished
  }

  get response() {
    this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/)
    return {
      status:RegExp.$1,
      statusText:RegExp.$2,
      headers:this.headers,
      body:this.bodyParser.content.join('')
    }
  }


  receive(string) {
    for(let i = 0;i<string.length;i++) {
      this.receiveChar(string.charAt(i))
    }
    console.log(this.statusLine,'状态行')
  }

  receiveChar(char) {
    // 状态行
    if(this.current === this.WAITING_STATUS_LINE) {
      if(char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END
      } else {
        this.statusLine += char
      }

    } else if(this.current === this.WAITING_STATUS_LINE_END) {
      if(char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }

    } else if(this.current === this.WAITING_HEADER_NAME) {
      if(char === ':') {
        this.current = this.WAITING_HEADER_SPACE
      } else if(char === '\r') {
        // 说明空行了
        this.current = this.WAITING_HEADER_BLOCK_END 
        if(this.headers['Transfer-Encoding'] === 'chunked') {
          this.bodyParser = new TrunkedBodyParser()
        }

      } else {
        this.headerName +=char
      }

    } else if(this.current === this.WAITING_HEADER_SPACE) {
      // 每个name和value之间都会有一个空格
      if(char === ' ') {
        this.current = this.WAITING_HEADER_VALUE
      }

    } else if(this.current === this.WAITING_HEADER_VALUE) {
      // 匹配name对应的value值
      // 匹配到\r时说明当前项已经匹配完成，这时将name和value存到headers里并清空name和value来进行下一次匹配
      if(char === '\r') {
        this.current = this.WAITING_HEADER_LINE_END 
        this.headers[this.headerName] = this.headerValue 
        this.headerName = ''
        this.headerValue = ''
      } else {
        this.headerValue +=char
      }

    } else if(this.current === this.WAITING_HEADER_LINE_END) {
      // 匹配到\n说明还有响应头没有匹配完成，继续去匹配响应头的name
      if(char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }

    } else if(this.current === this.WAITING_HEADER_BLOCK_END) {
      if(char === '\n') {
        this.current = this.WAITING_BODY
      }
      
    } else if(this.current === this.WAITING_BODY) {
      this.bodyParser.receiveChar(char)
    }
  }
}

class TrunkedBodyParser {
  constructor () {
    this.WAITING_LENGTH = 0 
    this.WAITING_LENGTH_LINE_END = 1
    this.READING_TRUNK = 2
    this.WAITING_NEW_LINE = 3
    this.WAITING_NEW_LINE_END = 4
    this.length = 0
    this.content = []
    this.isFinished = false
    this.current = this.WAITING_LENGTH
  }

  receiveChar(char) {
    if(this.current === this.WAITING_LENGTH) {
      
      if(char === '\r') {
        if(this.length === 0) {
          this.isFinished = true
        }
        this.current = this.WAITING_LENGTH_LINE_END
      } else {
        this.length *= 16 
        this.length += parseInt(char,16)
      }
    } else if(this.current === this.WAITING_LENGTH_LINE_END) {
      if(char === '\n') {
        this.current = this.READING_TRUNK 
      }
    } else if(this.current === this.READING_TRUNK) {
      this.content.push(char)
      this.length--
      if(this.length === 0) {
        this.current = this.WAITING_NEW_LINE
      }

    } else if(this.current === this.WAITING_NEW_LINE) {
      if(char === '\r') {
        this.current = this.WAITING_NEW_LINE_END
      }

    } else if(this.current === this.WAITING_NEW_LINE_END) {
      if(char === '\n') {
        this.current = this.WAITING_LENGTH 
      }
    }
  }
}

void async function () {
  let request = new Request({
    method:"POST",
    host:"127.0.0.1",
    port:"9999",
    path:"/",
    headers:{
      ["X-Foo2"]:"customed"
    },
    body:{
      name:"winter"
    }
  })

  let response = await request.send()
  console.log(response,4343434)
}()