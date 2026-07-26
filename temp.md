

现在 staging 已稳定，所有接口正常。可以 重新跑验收

**Redis** **和** **PM2** **验证**可以通过 以下方式 通过 SSH 验收
Staging 服务器：154.40.40.116                                                                                                                                                                                                                                              

  SSH 端口：22                                                                                                                                                                                                                                                               

  用户：root                                                                                                                                                                                                                                                                 

  密码：DWlxpKLc}6[N                                                                                                                                                                                                                                                         

  SSH 连接方式：sshpass -p 'DWlxpKLc}6[N' ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no root@154.40.40.116                                                                                                                                                      

  验证命令示例：                                                                                                                                                                                                                                                             

  # Redis 缓存 key 检查                                                                                                                                                                                                                                                      

  redis-cli keys "cache:*"                                                                                                                                                                                                                                                   

  redis-cli keys "models:*"                                                                                                                                                                                                                                                  

  redis-cli ttl "models:list"                                                                                                                                                                                                                                                

  # PM2 cluster 状态                                                                                                                                                                                                                                                         

  pm2 list                                                                                                                                                                                                                                                                   

  pm2 logs aigc-gateway --lines 20 --nostream | grep "worker\|scheduler"