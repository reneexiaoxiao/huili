import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const prompt = '请取得 https://github.com/reneexiaoxiao/huili 仓库，阅读 SKILL.md 和 references/first-run.md。先问我是否已有工作台，再核对我的 Agent 能力、资料账号、权限与部署位置；在我的环境里生成或融入前端，配置连接并以一场会议验收。不要把作者个人妙搭版的连接包当作前置条件。';
export function AgentConnectionDialog({open,onOpenChange}: {open:boolean;onOpenChange:(open:boolean)=>void;onLegacySetup?:()=>void}) {
 const [copied,setCopied]=useState(false);const [error,setError]=useState(false);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader>
  <DialogTitle>让自己的 Agent 接手</DialogTitle><DialogDescription>把仓库交给你的 Agent，由它在你的环境里核对授权、生成前端并完成连接。</DialogDescription>
 </DialogHeader><p>仓库包含工作流程、前端源码和接入说明。</p>
 <Button onClick={async()=>{try {await navigator.clipboard.writeText(prompt);setCopied(true);setError(false);}catch {setError(true);}}}>{copied?<Check/>:<Copy/>}{copied?'已复制接手指令':'复制接手指令'}</Button>
 <a href="https://github.com/reneexiaoxiao/huili/blob/main/docs/TAKEOVER.md" target="_blank" rel="noreferrer">打开接手说明</a>
 {error&&<p role="alert">复制失败，请打开接手说明复制。</p>}
 </DialogContent></Dialog>;
}
