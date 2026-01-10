# gpu_crash 示例

这个示例用很小的一组 facts/rules，演示“异常驱动的因果学习”闭环：

1) 初始规则集能解释 `display.black_screen=true`
2) 当新的异常事实 `gpu.device_removed=true` 出现时，解释失败 -> 生成 Event
3) Event Pool 累积到 3 个以上相似事件后，系统归纳出一个候选规则：
   - pre: (driver.version=555.1, env.os=win11, ...)
   - eff: gpu.device_removed=true
4) 新规则加入后，再处理同类 observation 会被解释，从而不再进入 Event Pool

## 运行

```bash
python run_demo.py
```

你会看到：
- explained 的 observation 数量
- event created 的 observation 数量
- 归纳出来的新 regulation
- 在第二轮 replay 中 event 被清空/显著减少
