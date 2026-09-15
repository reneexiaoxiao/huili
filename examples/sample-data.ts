import type { MeetingRecord, MeetingActionInboxItem, MeetingSeriesSnapshot } from '../shared/api.interface';
import type { ProjectCatalog, ProjectRecord } from '../shared/project.interface';
import type { BackendRequest } from '../client/src/lib/transport';
const at = (offset: number, hour = 10) => { const d=new Date(); d.setDate(d.getDate()+offset);d.setHours(hour,0,0,0);return d.toISOString(); };
const concepts = ['社区图书角', '开放日筹备', '公共花园'];
export const sampleMeetings: MeetingRecord[] = concepts.flatMap((title,p) => [-6,-2].map((day,i)=>({
 id:`sample-meeting-${p}-${i}`,externalKey:`sample:${p}:${i}`,recordType:'minutes',title:`${title} · 第 ${i+1} 次讨论`,project:title,
 startedAt:at(day,10+p),endedAt:at(day,11+p),durationMinutes:60,status:'ready',
 headline:i?'讨论结果已更新，下一步等待确认。':'已明确本次范围，保留尚未决定的问题。',
 summary:'这是完全虚构的示例，用于体验会议之间的延续。',decisions:['先完成一小步，再检查实际结果。'],risks:[],sourceLinks:{},actions:[],
})));
sampleMeetings.push({id:'sample-upcoming',externalKey:'sample:next',recordType:'scheduled',invitationStatus:'accepted',title:'社区图书角 · 下次讨论',project:concepts[0],startedAt:at(1,14),status:'upcoming',headline:'确认试行安排',decisions:[],risks:[],sourceLinks:{},actions:[]});
export const sampleCatalog: ProjectCatalog = {version:1,indexedAt:at(0),policy:{dailyAt:'',timezone:'Asia/Shanghai'},inbox:[],coverage:{tasks:0,linkedTasks:0,chats:0,meetings:7,chatComplete:false,unreadableTasks:0},projects:concepts.map((name,i):ProjectRecord=>({
 id:`sample-project-${i}`,name,group:'虚构示例',goal:['让一本书遇见下一位读者','完成一次小而完整的开放日','让公共空间有一处可以停留的角落'][i],
 activity:'recent',lastActivityAt:at(-1),checkedAt:at(0),tasks:[],chats:[],meetings:sampleMeetings.filter(m=>m.project===name).map(m=>({id:m.id,name:m.title,startedAt:m.startedAt})),
 evidence:[{id:`sample-evidence-${i}`,kind:'sample',label:'虚构示例记录',speaker:'示例参与者',time:at(-1),url:'',text:['我来确认试行范围。','等协作方确认场地。','再核对一次下一步由谁负责。'][i]}],
 attention:{checkedAt:at(0),state:i===2?'uncertain':'open',items:[{owner:i===0?'self':i===1?'other':'unknown',ownerName:i===1?'协作方':'',priority:i===0?'P1':'P2',blocked:i===0,text:['确认第一批试行范围','等待场地安排回复','核对下一步负责人'][i],reason:['确认后才能开始准备。','场地确定后再安排物料。','现有记录没有明确负责人。'][i],assignmentQuote:['我来确认试行范围。','等协作方确认场地。',''][i],sourceIds:[`sample-evidence-${i}`]}]},
 digest:{headline:['先让第一批书流动起来','场地回复后，继续安排','下一步的责任还待核对'][i],stage:'试行准备',summary:'当前仅展示虚构项目的工作结构。',facts:[{text:'已完成两次讨论，形成了初步范围。',sourceIds:[`sample-evidence-${i}`]}],nextSteps:[],waiting:[],changes:[],deliverables:[]},
}))};
export const sampleSnapshot: MeetingSeriesSnapshot = {status:'ready',generation:1,meetingCount:7,lastSuccessfulAt:at(0),dailyBlankDrawer:[],candidates:concepts.map((label,i)=>({id:`sample-series-${i}`,label,themeCluster:'一起做点小事',meetingExternalKeys:[`sample:${i}:0`,`sample:${i}:1`],strength:0.8,confidence:0.8,matchReasons:['同一虚构项目的连续讨论'],conflictSignals:[],currentProgress:'试行准备中',nextConclusion:'核对下一步需要谁的决定'}))};
const notes: MeetingActionInboxItem[]=[];
const ids=new Map<string,string>();
export async function sampleRequest(options:BackendRequest):Promise<unknown> {
 const u=options.url; const method=options.method||'GET';
 if(method==='GET') {
  if(u==='/api/hub/projects') return structuredClone(sampleCatalog);
  if(u==='/api/hub/overview') return {meetings:sampleMeetings,counts:{meetings:7,awaitingConfirmation:0,inProgress:0,done:0,upcoming:1},agent:{paired:false}};
  if(u==='/api/hub/series') return {snapshot:sampleSnapshot,meetings:sampleMeetings};
  if(u==='/api/hub/actions') return {actions:structuredClone(notes),counts:{myTodos:notes.filter(n=>n.status!=='done').length,awaitingConfirmation:0,aiInProgress:0,completed:notes.filter(n=>n.status==='done').length}};
  if(u.includes('ignored')) return {meetings:[]};
 }
 const body=options.data as Record<string,string>|undefined;
 if(u==='/api/hub/captures' && method==='POST' && body?.mode==='record') {
  const prior=ids.get(body.clientRequestId);if(prior)return {actionId:prior,status:'planned'};
  const id='capture:'+crypto.randomUUID();ids.set(body.clientRequestId,id);
  notes.unshift({id,actionId:id,category:'user_owned',title:body.text,description:body.text,status:'planned',progress:0,confirmationRequired:false,origin:'user_added',resultLinks:[],meetingId:'sample-capture',meetingTitle:'随手记',meetingStartedAt:at(0),meetingSourceLinks:{},sourceType:'capture'});
  return {actionId:id,status:'planned'};
 }
 const match=u.match(/\/(?:actions|captures)\/([^/]+)\/(complete|reopen)$/);
 if(match && method==='POST') {const note=notes.find(n=>n.actionId===decodeURIComponent(match[1]));if(!note)throw new Error('示例记录不存在，请刷新后重试。');note.status=match[2]==='complete'?'done':'planned';return {actionId:note.actionId,status:note.status};}
 throw new Error('示例预览尚未连接你的 Agent。请复制接手指令完成接入后再执行。');
}
