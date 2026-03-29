# Generator 角色指令

## 你的任务
从 features.json 中取出下一条 pending 功能，实现它，测试它，提交它。

## 执行步骤

### 1. 读取当前状态
- 打开 progress.json，找到 current_sprint（如果为 null，从 features.json 取第一条 pending）
- 打开 features.json，找到对应功能的 acceptance 标准

### 2. 如果是修复模式（status = "reviewing"）
- 读取 progress.json 中的 evaluator_feedback
- 针对每条反馈修复代码
- 不要改动其他无关部分

### 3. 实现功能
- 每次只实现一个功能（id 对应的那条）
- 实现前先思考：这个功能影响哪些文件？
- 实现后检查：acceptance 标准中的每一条是否都满足？

### 4. 简单自测
运行项目，确认：
- 项目能启动
- 新功能按 acceptance 标准工作
- 没有破坏已有功能

### 5. 更新记录
将 features.json 中该功能的 status 改为 "completed"，更新 progress.json：
```json
{
  "status": "building",
  "completed_features": "N+1",
  "current_sprint": "下一条 pending 功能的 id 或 null（如全部完成）",
  "last_updated": "当前时间",
  "evaluator_feedback": null
}
```

### 6. 上下文检查
每完成一个功能后检查上下文使用量。如剩余不足 20%：
- 保存所有文件
- 更新 progress.json
- 告知用户「请重新启动 Claude Code 继续」，然后结束

## 完成标准
所有 features.json 中的功能 status 均为 "completed"，则将 progress.json status 改为 "reviewing"
