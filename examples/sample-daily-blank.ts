import type { DailyBlankSnapshot } from '../shared/api.interface';

const today = (daysAgo = 0) => {
  return new Date(Date.now() + 8 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
};
const generatedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// The mirror PNG and the period's visual interaction come from the author's
// personal version. The image metadata and all real meeting copy are removed.
export const sampleDailyBlank: DailyBlankSnapshot = {
  id: 'sample-blank-period',
  date: today(),
  state: 'artifact',
  title: '句点暂留',
  content: '改到最后，句点先落在纸上。下一次打开，还可以从这里接着写。',
  whyNow: '虚构的开放日筹备讨论已经有了可试行的版本，仍保留后续修改空间。',
  conversationStarter: '沿着“句点暂留”继续聊：哪些事可以先交付一版，哪些决定还要留待核对？请只使用演示资料。',
  contractVersion: '2026-09-10.open-media',
  canvas: {
    type: 'html', source: 'agent', height: 'compact', ariaLabel: '终版后面的句点露出红色尾巴，点开可看到下一句话',
    markup: `<style>
      .typesetter-blank{box-sizing:border-box;min-height:280px;width:100%;padding:32px 16px;display:grid;place-items:center;background:#fff;color:#141414;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
      .typesetter-blank *{box-sizing:border-box}
      .typesetter-blank details{width:max-content;max-width:100%;margin:0 auto}
      .typesetter-blank summary{display:flex;align-items:center;justify-content:center;list-style:none;cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:3px}
      .typesetter-blank summary::-webkit-details-marker{display:none}
      .typesetter-blank summary::marker{content:""}
      .typesetter-blank summary:focus-visible{outline:2px solid #d83b2c;outline-offset:12px}
      .typesetter-blank .statement{display:flex;align-items:baseline;flex:none;font-size:clamp(56px,14vw,112px);font-weight:800;letter-spacing:-.065em;line-height:1.15;white-space:nowrap}
      .typesetter-blank .mark{display:block;flex:none;width:.34em;height:.561em;margin-left:.065em;transform:translateY(.27em);overflow:visible}
      .typesetter-blank .tail{clip-path:inset(0 0 48% 0);transition:clip-path 180ms ease-out}
      .typesetter-blank .continuation{display:none;flex:none;margin-left:clamp(12px,2.5vw,24px);font-size:clamp(15px,3vw,23px);font-weight:500;line-height:1.65;letter-spacing:.025em;white-space:nowrap}
      .typesetter-blank details[open] .tail{clip-path:inset(0 0 0 0)}
      .typesetter-blank details[open] .continuation{display:block}
      @media(prefers-reduced-motion:reduce){.typesetter-blank .tail{transition:none}}
    </style><main class="typesetter-blank"><details><summary aria-label="展开句点后面的话"><span class="statement"><span>终版</span><svg class="mark" viewBox="0 0 40 66" role="img" aria-label="露出红色尾巴的句点"><path class="tail" d="M23 23 C29 36 23 47 10 53" fill="none" stroke="#d83b2c" stroke-width="7" stroke-linecap="round"></path><circle cx="18" cy="19" r="9" fill="#141414"></circle></svg></span><span class="continuation">下一次打开，<br>还可以接着写。</span></summary></details></main>`,
  },
  evidenceExternalKeys: ['sample:1:1'],
  tags: ['有意思'],
  generatedAt,
  expiresAt,
};

export const sampleDailyBlankDrawer: DailyBlankSnapshot[] = [
  {
    id: 'sample-blank-rain', date: today(3), state: 'artifact', title: '一滴比一场雨贵',
    content: '公共花园的试种先从一小块土开始。第一滴水落下去，才知道接下来该怎么照看。',
    whyNow: '虚构的公共花园项目正在讨论先试哪一小块地。',
    conversationStarter: '继续聊这个虚构公共花园的试种：先做什么，才能学到下一步真正需要的信息？',
    canvas: {
      type: 'html', source: 'agent', height: 'compact', ariaLabel: '纸面上一滴蓝色的水落向一条细细的土壤线',
      markup: `<style>
        .stage{min-height:100vh;position:relative;overflow:hidden;display:grid;place-items:center;background:linear-gradient(180deg,#f9f9f5 0%,#f2eadb 100%)}
        .drop{width:clamp(38px,8vw,92px);height:clamp(55px,11vw,130px);background:linear-gradient(145deg,#c7dfe6,#527d96);border-radius:8% 75% 70% 70%;transform:rotate(45deg);box-shadow:18px 18px 35px #7c999a33;animation:arrive 2.8s ease-in-out infinite}
        .earth{position:absolute;bottom:19%;left:12%;right:12%;height:2px;background:#a5826b;box-shadow:0 12px 0 #d2b9a6}
        .line{position:absolute;bottom:9%;left:0;right:0;text-align:center;color:#6c625b;font-family:"Songti SC",STSong,serif;font-size:clamp(18px,3vw,30px);letter-spacing:.14em}
        @keyframes arrive{0%,100%{transform:translateY(-7px) rotate(45deg)}50%{transform:translateY(9px) rotate(45deg)}}
        @media(prefers-reduced-motion:reduce){.drop{animation:none}}
      </style><main class="stage"><div class="drop"></div><div class="earth"></div><div class="line">先落下一滴，再谈一场雨。</div></main>`,
    },
    evidenceExternalKeys: ['sample:2:0'], tags: ['值得追问', '有意思'], savedAt: generatedAt, generatedAt, expiresAt,
  },
  {
    id: 'sample-blank-mirrors', date: today(3), state: 'artifact', title: '镜子各忙各的',
    content: '同一只壶，在三面镜子里各忙各的。也许不同视角可以同时成立。',
    whyNow: '虚构的图书角项目在两次讨论中，分别谈到了书目、场地和借阅方式。',
    conversationStarter: '继续聊“镜子各忙各的”：这三种视角怎样放在一起，才不会丢掉任何一个人的关切？',
    visual: {
      type: 'image', source: 'agent', placement: 'centerpiece',
      imageUrl: '/demo/daily-blank-mirrors.png',
      alt: '杏橙色桌面上的白瓷茶壶，后方三面镜子里，同一只壶分别倒茶、接雨、晾着壶盖。',
    },
    evidenceExternalKeys: ['sample:0:0', 'sample:0:1'], tags: ['值得追问'], savedAt: generatedAt, generatedAt, expiresAt,
  },
  {
    id: 'sample-blank-scenes', date: today(3), state: 'artifact', title: '四种现场，同一条完成记录',
    content: '书签贴上书脊；花苗落进小盆；开放日留出一张空椅；没定下来的问题写在纸上。每一件都先留下下一步。',
    whyNow: '虚构的三个社区项目，进展不同，却都需要把下一步写清楚。',
    conversationStarter: '请从这些虚构场景中选择一个，讨论什么才算真正完成。',
    evidenceExternalKeys: ['sample:0:0', 'sample:1:0', 'sample:2:0'],
    tags: ['工作方式'], savedAt: generatedAt, generatedAt, expiresAt,
  },
];
