import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const prompt = '请阅读 https://github.com/reneexiaoxiao/huili 的 SKILL.md 和 docs/TAKEOVER.md。先核对我的 Agent 能力、资料授权和部署条件，给出最小接入方案；保留会里的前端风格，使用我的数据与账号，先验证一场会议的完整闭环。';
export function AgentConnectionDialog({open,onOpenChange}: {open:boolean;onOpenChange:(open:boolean)=>void;onLegacySetup?:()=>void}) {
 const [copied,setCopied]=useState(false);const [error,setError]=useState(false);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader>
  <DialogTitle>连接自己的 Agent</DialogTitle><DialogDescription>先由你的 Agent 核对账号、资料范围与部署条件，再连接工作空间。</DialogDescription>
 </DialogHeader><p>仓库包含工作流程、前端源码和连接协议。</p>
 <Button onClick={async()=>{try {await navigator.clipboard.writeText(prompt);setCopied(true);setError(false);}catch {setError(true);}}}>{copied?<Check/>:<Copy/>}{copied?'已复制接手指令':'复制接手指令'}</Button>
 <a href="https://github.com/reneexiaoxiao/huili/blob/main/docs/TAKEOVER.md" target="_blank" rel="noreferrer">打开接手说明</a>
 {error&&<p role="alert">复制失败，请打开接手说明复制。</p>}
 </DialogContent></Dialog>;
}
