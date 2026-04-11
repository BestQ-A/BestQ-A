---
id: "atom_check_tcp_port"
type: "atom"
desc: "检查特定 IP 和端口的 TCP 连通性"
inputs: ["target_host", "target_port"]
outputs: ["is_reachable (bool)", "latency_ms (int)"]
---

# 实现 (Implementation)

这是一个标准操作，用于验证网络层连通性。

## Linux CLI

```bash
# 使用 netcat 检测端口是否开放
nc -zv -w 3 {target_host} {target_port}
```

## Python

```python
import socket
import time

def check_tcp_port(target_host, target_port, timeout=3):
    start_time = time.time()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        result = sock.connect_ex((target_host, int(target_port)))
        latency = (time.time() - start_time) * 1000
        if result == 0:
            return {"is_reachable": True, "latency_ms": int(latency)}
        else:
            return {"is_reachable": False, "latency_ms": None}
    except Exception:
        return {"is_reachable": False, "latency_ms": None}
    finally:
        sock.close()
```
