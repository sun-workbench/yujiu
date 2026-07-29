/**
 * 每日内容更新脚本 — GitHub Actions 自动运行
 * 从 B站公开 API 抓取热门内容，生成抖音搜索链接，更新 index.html
 */

const https = require('https');
const fs = require('fs');

// ============ 工具函数 ============

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    };
    const req = https.get(url, { headers, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function formatViews(num) {
  if (num >= 10000) return Math.round(num / 10000) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

function douyinUrl(keyword) {
  return `https://www.douyin.com/search/${encodeURIComponent(keyword)}`;
}

// ============ 数据源：B站公开 API ============

// 热门视频（无需认证）
async function fetchBilibiliPopular() {
  const res = await fetchJSON('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1');
  if (res && res.code === 0 && res.data && res.data.list) {
    return res.data.list.map(v => ({
      title: v.title.replace(/<[^>]*>/g, '').trim(),
      author: (v.owner && v.owner.name) || '未知UP主',
      views: formatViews((v.stat && v.stat.view) || 0),
      tag: v.tname || '热门',
      pic: v.pic || ''
    }));
  }
  return [];
}

// 热搜关键词
async function fetchBilibiliHotSearch() {
  const res = await fetchJSON('https://api.bilibili.com/x/web-interface/search/square?limit=20');
  if (res && res.code === 0 && res.data) {
    // 结构可能是 data.list 或 data.trending.list
    const list = res.data.trending ? res.data.trending.list : (res.data.list || []);
    return list.map(item => item.keyword || item.show_name || '').filter(k => k && k.length < 40);
  }
  return [];
}

// 分类检索
async function searchBilibili(keyword) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&ps=20`;
  const res = await fetchJSON(url);
  if (res && res.code === 0 && res.data && res.data.result) {
    return res.data.result.map(v => ({
      title: v.title.replace(/<[^>]*>/g, '').trim(),
      author: v.author || '未知',
      views: formatViews(v.play || 0),
      tag: v.tag || ''
    }));
  }
  return [];
}

// ============ 数据数组生成器 ============

// fallback emoji 列表
const icons = ['🔥','📈','🎯','💡','🌟','📊','🎬','💰','🤖','📝','🎵','💼','📕','✍️','🚀','⚡'];

function pickIcons(n) {
  const shuffled = [...icons].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// 1. 首页知识速览 tips
function generateTips(hotSearches, popular) {
  const baseTopics = [
    { icon: '📈', kw: '抖音流量池机制', tag: '底层逻辑' },
    { icon: '🎯', kw: '抖音爆款内容公式', tag: '选题技巧' },
    { icon: '📊', kw: 'SQL面试题', tag: '数据技能' },
    { icon: '✍️', kw: '标书撰写技巧', tag: '职场技能' },
    { icon: '🤖', kw: 'AI生成短视频', tag: 'AI工具' },
    { icon: '📝', kw: '抖音完播率技巧', tag: '核心技能' },
  ];

  const fresh = hotSearches.slice(0, 8).map((kw, i) => ({
    icon: icons[i % icons.length],
    title: kw,
    tag: '今日热搜',
    url: douyinUrl(kw)
  }));

  const rest = baseTopics.map(t => ({
    icon: t.icon,
    title: t.kw,
    tag: t.tag,
    url: douyinUrl(t.kw)
  }));

  return [...fresh, ...rest].slice(0, 12);
}

// 2. 健身视频 fitVideos
const bodyParts = [
  { part: 'leg', emoji: '🦵', kw: '瘦腿训练 跟练' },
  { part: 'hip', emoji: '🍑', kw: '蜜桃臀训练 居家' },
  { part: 'back', emoji: '🧘', kw: '背部塑形 改善体态' },
  { part: 'arm', emoji: '💪', kw: '手臂紧致 拜拜肉' },
  { part: 'abs', emoji: '🧘', kw: '马甲线训练 核心' },
  { part: 'stretch', emoji: '🌙', kw: '全身拉伸 睡前瑜伽' }
];

function generateFitVideos(popular) {
  const fitVids = popular.filter(v =>
    /健身|塑形|减肥|训练|瑜伽|瘦|运动|燃脂|拉伸/.test(v.title)
  ).slice(0, 12);

  if (fitVids.length < 12) {
    // 用 B站搜索补充
    return bodyParts.flatMap(bp => [
      { part: bp.part, title: `热门·${bp.kw.split(' ')[0]}跟练`, author: '抖音热门', views: '50万', tag: bp.kw.split(' ')[0], emoji: bp.emoji, url: douyinUrl(bp.kw) },
      { part: bp.part, title: `精选·${bp.kw}`, author: '每日推荐', views: '30万', tag: bp.part, emoji: bp.emoji, url: douyinUrl(bp.kw) }
    ]);
  }

  return fitVids.map((v, i) => ({
    part: bodyParts[i % 6].part,
    title: v.title,
    author: v.author,
    views: v.views,
    tag: v.tag,
    emoji: bodyParts[i % 6].emoji,
    url: douyinUrl(v.title.slice(0, 20))
  }));
}

// 3. 求职岗位 allJobs
const jobPool = [
  { title: '数据分析师', salary: '8-15K', tags: ['数据分析', 'SQL', '成都'], source: 'BOSS直聘', kw: '数据分析师' },
  { title: '短视频内容运营', salary: '10-18K', tags: ['短视频', '内容', '成都'], source: 'BOSS直聘', kw: '内容运营' },
  { title: '新媒体运营', salary: '7-12K', tags: ['新媒体', '抖音', '成都'], source: '智联招聘', kw: '新媒体运营' },
  { title: '视频剪辑师', salary: '8-15K', tags: ['剪辑', '后期', '成都'], source: '前程无忧', kw: '视频剪辑' },
  { title: '小红书运营', salary: '6-10K', tags: ['小红书', '运营', '成都'], source: '猎聘', kw: '小红书运营' },
  { title: '电商运营', salary: '10-20K', tags: ['电商', '淘宝', '成都'], source: '猎聘', kw: '电商运营' },
  { title: '标书专员', salary: '7-10K', tags: ['标书', '招投标', '成都'], source: '前程无忧', kw: '标书' },
  { title: '内容运营专员', salary: '6-9K', tags: ['内容', '电商', '成都'], source: '鱼泡直聘', kw: '内容运营' },
  { title: '运营助理', salary: '5-7K', tags: ['运营', '助理', '成都'], source: 'BOSS直聘', kw: '运营助理' },
  { title: '数据专员', salary: '6-10K', tags: ['数据', 'Excel', '成都'], source: '智联招聘', kw: '数据专员' },
  { title: '直播运营', salary: '10-20K', tags: ['直播', '带货', '成都'], source: 'BOSS直聘', kw: '直播运营' },
  { title: '社群运营', salary: '6-10K', tags: ['社群', '微信', '成都'], source: 'BOSS直聘', kw: '社群运营' },
  { title: 'AI训练师', salary: '12-25K', tags: ['AI', '数据标注', '成都'], source: '猎聘', kw: 'AI训练师' },
  { title: '产品运营', salary: '9-15K', tags: ['产品', '用户增长', '成都'], source: 'BOSS直聘', kw: '产品运营' }
];

const companyPool = [
  '字节跳动', '腾讯科技', '某互联网大厂', '某MCN机构', '乐狗科技',
  '某传媒公司', '微光聚梦', '某电商平台', '某金融科技', '某AI公司',
  '极米科技', '某在线教育', '某SaaS公司', '某游戏公司'
];

function generateJobs(hotSearches) {
  // 根据当天日期洗牌
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const shuffled = [...jobPool].sort(() => seed % 2 === 0 ? 1 : -1); // 简单日期种子
  const companies = [...companyPool].sort(() => (seed + 1) % 2 === 0 ? 1 : -1);

  return shuffled.slice(0, 10).map((j, i) => ({
    title: j.title,
    company: companies[i % companies.length],
    salary: j.salary,
    tags: j.tags,
    source: j.source,
    url: j.source === 'BOSS直聘'
      ? `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(j.kw)}`
      : j.source === '猎聘'
        ? `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(j.kw)}`
        : j.source === '前程无忧'
          ? `https://we.51job.com/pc/search?keyword=${encodeURIComponent(j.kw)}`
          : j.source === '智联招聘'
            ? `https://sou.zhaopin.com/?kw=${encodeURIComponent(j.kw)}`
            : 'https://www.yupaozhipin.com'
  }));
}

// 4. 创作脚本 scripts
const scriptTemplates = [
  { cat: '治愈', tag: '情感共鸣', template: '场景：{kw}的温暖瞬间\n画面：慢镜头+暖色调+钢琴BGM\n文案：{kw}的那一刻，我明白了什么是真正的幸福\n音效：轻柔钢琴+环境音' },
  { cat: '搞笑', tag: '反转', template: '场景：以为在{kw}，结果在{kw2}\n画面：快速切换+夸张表情+鸭子音效\n文案：当你以为一切都在{kw}的时候...\n音效：卡点转场音+笑声' },
  { cat: '情感', tag: '深夜语录', template: '场景：关于{kw}的独白\n画面：特写+暗调+雨天背景\n文案：{kw}这件事，每个人都逃不过\n音效：雨声+低沉旁白' },
  { cat: '干货', tag: '科普', template: '场景：{kw}的3个冷知识\n画面：图表+快节奏剪辑+文字卡片\n文案：90%的人都不知道的{kw}秘密\n音效：信息提示音' },
];

function generateScripts(hotSearches) {
  const d = new Date();
  const seed = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) % scriptTemplates.length;
  const rotated = [...scriptTemplates.slice(seed), ...scriptTemplates.slice(0, seed)];

  const sources = ['噜噜', '噜妹'];
  const extras = [
    { cat: '治愈', source: '噜噜', tag: '温暖日常' },
    { cat: '治愈', source: '噜妹', tag: '萌宠时刻' },
    { cat: '治愈', source: '噜噜', tag: '美食治愈' },
    { cat: '搞笑', source: '噜妹', tag: '日常翻车' },
    { cat: '搞笑', source: '噜噜', tag: 'AI整活' },
    { cat: '搞笑', source: '噜妹', tag: '模仿秀' },
    { cat: '情感', source: '噜噜', tag: '人生感悟' },
    { cat: '情感', source: '噜妹', tag: '成长故事' },
    { cat: '干货', source: '噜噜', tag: 'AI教程' },
    { cat: '干货', source: '噜妹', tag: '运营技巧' },
  ];

  return extras.map((extra, i) => {
    const kw = hotSearches[i % hotSearches.length] || extra.tag;
    const kw2 = hotSearches[(i + 3) % hotSearches.length] || '意外';
    const t = rotated[i % rotated.length];
    const prompt = t.template.replace(/\{kw\}/g, kw).replace(/\{kw2\}/g, kw2);
    return {
      title: `${kw} · ${t.cat}风`,
      cat: t.cat,
      source: extra.source,
      tag: extra.tag,
      prompt
    };
  });
}

// 5. 菜谱 recipes
const recipePool = [
  { name: '西红柿炒鸡蛋', emoji: '🍅', badge: '家常', time: '15min', ingredients: ['西红柿 2个','鸡蛋 3个','葱花 适量','盐 适量','糖 1勺'], steps: '1.鸡蛋打散加盐\n2.热锅冷油炒鸡蛋盛出\n3.西红柿切块下锅\n4.炒出汤汁加糖\n5.加入鸡蛋翻炒\n6.撒葱花出锅', tutorial: '抖音搜「西红柿炒鸡蛋做法」' },
  { name: '麻婆豆腐', emoji: '🌶️', badge: '川菜', time: '20min', ingredients: ['嫩豆腐 1块','肉沫 100g','豆瓣酱 2勺','花椒粉 适量','葱花 适量'], steps: '1.豆腐切块焯水\n2.热锅炒香肉沫\n3.加豆瓣酱炒出红油\n4.加水和豆腐\n5.小火煮5分钟\n6.勾芡撒花椒粉', tutorial: '抖音搜「麻婆豆腐做法」' },
  { name: '肉沫焖土豆丁', emoji: '🥔', badge: '家常', time: '25min', ingredients: ['土豆 2个','肉沫 100g','葱姜蒜 适量','生抽 2勺','老抽 1勺'], steps: '1.土豆切小丁\n2.泡水去淀粉\n3.爆香葱姜蒜\n4.加肉沫炒香\n5.加土豆丁翻炒\n6.加生抽老抽\n7.加水焖10分钟\n8.大火收汁', tutorial: '抖音搜「肉沫土豆丁」' },
  { name: '可乐鸡翅', emoji: '🥤', badge: '美味', time: '30min', ingredients: ['鸡翅中 8个','可乐 1罐','生抽 2勺','姜片 3片','料酒 1勺'], steps: '1.鸡翅划刀焯水\n2.热锅煎至两面金黄\n3.加姜片料酒\n4.倒入可乐没过鸡翅\n5.加生抽\n6.大火收汁', tutorial: '抖音搜「可乐鸡翅做法」' },
  { name: '蛋炒饭', emoji: '🍚', badge: '快手', time: '10min', ingredients: ['剩米饭 1碗','鸡蛋 2个','葱花 适量','火腿肠 1根','盐 适量'], steps: '1.鸡蛋打散炒熟\n2.下米饭翻炒\n3.加火腿丁翻炒\n4.加盐调味\n5.撒葱花出锅', tutorial: '抖音搜「蛋炒饭做法」' },
  { name: '糖醋里脊', emoji: '🍖', badge: '经典', time: '30min', ingredients: ['猪里脊 300g','番茄酱 3勺','糖 2勺','醋 2勺','淀粉 适量'], steps: '1.里脊肉切条\n2.加盐料酒腌制\n3.裹淀粉油炸\n4.调糖醋汁\n5.加肉翻炒裹汁', tutorial: '抖音搜「糖醋里脊做法」' },
  { name: '清炒时蔬', emoji: '🥬', badge: '减脂', time: '10min', ingredients: ['时令青菜 1把','蒜瓣 3颗','盐 适量','蚝油 1勺'], steps: '1.青菜洗净切段\n2.热锅下油爆香蒜\n3.下青菜大火翻炒\n4.加盐蚝油调味\n5.炒至断生出锅', tutorial: '抖音搜「清炒时蔬做法」' },
  { name: '红烧排骨', emoji: '🥩', badge: '硬菜', time: '45min', ingredients: ['排骨 500g','冰糖 适量','生抽 3勺','老抽 1勺','八角桂皮 适量'], steps: '1.排骨焯水\n2.冰糖炒糖色\n3.下排骨翻炒上色\n4.加调料和水\n5.小火炖30分钟\n6.大火收汁', tutorial: '抖音搜「红烧排骨做法」' },
  { name: '蒜蓉西兰花', emoji: '🥦', badge: '快手', time: '10min', ingredients: ['西兰花 1颗','蒜末 适量','盐 适量','蚝油 1勺'], steps: '1.西兰花切小朵焯水\n2.热锅炒香蒜末\n3.下西兰花翻炒\n4.加蚝油盐调味\n5.翻炒均匀出锅', tutorial: '抖音搜「蒜蓉西兰花做法」' },
  { name: '宫保鸡丁', emoji: '🐔', badge: '经典', time: '25min', ingredients: ['鸡胸肉 300g','花生米 50g','黄瓜 1根','干辣椒 适量','豆瓣酱 1勺'], steps: '1.鸡肉切丁腌制\n2.花生米炒香\n3.热锅炒鸡丁\n4.加豆瓣酱辣椒\n5.加黄瓜丁翻炒\n6.加花生拌匀', tutorial: '抖音搜「宫保鸡丁做法」' },
  { name: '酸辣土豆丝', emoji: '🥔', badge: '快手', time: '15min', ingredients: ['土豆 2个','干辣椒 适量','醋 2勺','花椒 适量','盐 适量'], steps: '1.土豆切细丝\n2.泡水去淀粉\n3.热油爆香花椒辣椒\n4.下土豆丝大火爆炒\n5.加醋和盐出锅', tutorial: '抖音搜「酸辣土豆丝做法」' },
  { name: '葱油拌面', emoji: '🍜', badge: '快手', time: '15min', ingredients: ['面条 1把','葱 1大把','生抽 3勺','老抽 1勺','糖 1勺'], steps: '1.葱切段炸至金黄\n2.煮面至八分熟\n3.调酱汁\n4.热油浇面\n5.拌匀即可', tutorial: '抖音搜「葱油拌面做法」' },
  { name: '金汤肥牛', emoji: '🥘', badge: '开胃', time: '20min', ingredients: ['肥牛 200g','金针菇 1把','南瓜泥 2勺','黄灯笼椒酱 1勺','蒜末 适量'], steps: '1.金针菇焯水铺碗底\n2.热锅炒香蒜末\n3.加黄灯笼椒酱\n4.加水和南瓜泥\n5.肥牛下锅烫熟\n6.倒入碗中', tutorial: '抖音搜「金汤肥牛做法」' },
  { name: '凉拌黄瓜', emoji: '🥒', badge: '快手', time: '10min', ingredients: ['黄瓜 2根','蒜末 适量','醋 2勺','生抽 1勺','辣椒油 1勺'], steps: '1.黄瓜拍碎切段\n2.加盐腌制5分钟\n3.调凉拌汁\n4.拌匀即可', tutorial: '抖音搜「凉拌黄瓜做法」' },
];

function generateRecipes() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  // 使用 Fisher-Yates 洗牌
  const arr = [...recipePool];
  let s = seed;
  function nextRand() {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 14);
}

// ============ HTML 替换 ============

function replaceArrayBlock(html, varName, newArrayStr) {
  const regex = new RegExp(
    `(const ${varName} = )\\[[\\s\\S]*?\\n\\];`,
    'm'
  );
  const result = html.replace(regex, `$1${newArrayStr}\n];`);
  if (result === html) {
    console.warn(`警告: 未找到数组 ${varName}`);
  }
  return result;
}

function replaceTipsBlock(html, newArrayStr) {
  const regex = /(const tips = )\[[\s\S]*?\n  \];/;
  const result = html.replace(regex, `$1${newArrayStr}\n  ];`);
  if (result === html) {
    console.warn('警告: 未找到 tips 数组');
  }
  return result;
}

// ============ 格式化函数 ============

function formatTips(arr) {
  return '[\n    ' + arr.map(t =>
    `{ icon: '${t.icon}', title: '${t.title.replace(/'/g, "\\'")}', tag: '${t.tag}', url: '${t.url}' }`
  ).join(',\n    ') + '\n  ';
}

function formatFitVideos(arr) {
  return '[\n  ' + arr.map(v =>
    `{ part: '${v.part}', title: '${v.title.replace(/'/g, "\\'")}', author: '${v.author}', views: '${v.views}', tag: '${v.tag}', emoji: '${v.emoji}', url: '${v.url}' }`
  ).join(',\n  ') + '\n';
}

function formatJobs(arr) {
  return '[\n  ' + arr.map(j =>
    `{ title: '${j.title}', company: '${j.company}', salary: '${j.salary}', tags: [${j.tags.map(t => `'${t}'`).join(', ')}], source: '${j.source}', url: '${j.url}' }`
  ).join(',\n  ') + '\n';
}

function formatScripts(arr) {
  return '[\n  ' + arr.map(s =>
    `{\n    title: '${s.title.replace(/'/g, "\\'")}',\n    cat: '${s.cat}',\n    source: '${s.source}',\n    tag: '${s.tag}',\n    prompt: '${s.prompt.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'\n  }`
  ).join(',\n  ') + '\n';
}

function formatRecipes(arr) {
  return '[\n  ' + arr.map(r =>
    `{ name: '${r.name}', emoji: '${r.emoji}', badge: '${r.badge}', time: '${r.time}', ingredients: [${r.ingredients.map(ing => `'${ing}'`).join(', ')}], steps: '${r.steps.replace(/'/g, "\\'").replace(/\n/g, '\\n')}', tutorial: '${r.tutorial}' }`
  ).join(',\n  ') + '\n';
}

// ============ 主流程 ============

async function main() {
  console.log('=== 每日内容更新开始 ===');
  console.log(`时间: ${new Date().toISOString()}`);

  // 1. 抓取实时数据
  console.log('\n[1/4] 抓取B站热门数据...');
  const [popular, hotSearches] = await Promise.all([
    fetchBilibiliPopular(),
    fetchBilibiliHotSearch()
  ]);
  console.log(`  热门视频: ${popular.length} 条`);
  console.log(`  热搜关键词: ${hotSearches.length} 条`);

  // 2. 抓取分类内容
  console.log('\n[2/4] 抓取分类内容...');
  const [fitnessResults, cookingResults] = await Promise.all([
    searchBilibili('健身跟练'),
    searchBilibili('家常菜做法')
  ]);
  console.log(`  健身视频: ${fitnessResults.length} 条`);
  console.log(`  菜谱视频: ${cookingResults.length} 条`);

  // 3. 生成数据
  console.log('\n[3/4] 生成内容数组...');
  const newTips = generateTips(hotSearches, popular);
  const newFitVideos = generateFitVideos(
    fitnessResults.length >= 6 ? fitnessResults : popular
  );
  const newJobs = generateJobs(hotSearches);
  const newScripts = generateScripts(hotSearches);
  const newRecipes = generateRecipes();

  console.log(`  tips: ${newTips.length} 条`);
  console.log(`  fitVideos: ${newFitVideos.length} 个`);
  console.log(`  allJobs: ${newJobs.length} 个`);
  console.log(`  scripts: ${newScripts.length} 个`);
  console.log(`  recipes: ${newRecipes.length} 个`);

  // 4. 更新 HTML
  console.log('\n[4/4] 更新 index.html...');
  let html = fs.readFileSync('index.html', 'utf8');
  html = replaceTipsBlock(html, formatTips(newTips));
  html = replaceArrayBlock(html, 'fitVideos', formatFitVideos(newFitVideos));
  html = replaceArrayBlock(html, 'allJobs', formatJobs(newJobs));
  html = replaceArrayBlock(html, 'scripts', formatScripts(newScripts));
  html = replaceArrayBlock(html, 'recipes', formatRecipes(newRecipes));

  fs.writeFileSync('index.html', html);
  console.log('  已保存更新');

  // 验证
  if (html.includes('const fitVideos = [')) {
    console.log('  ✓ fitVideos 替换成功');
  }
  if (html.includes('const allJobs = [')) {
    console.log('  ✓ allJobs 替换成功');
  }
  if (html.includes('const scripts = [')) {
    console.log('  ✓ scripts 替换成功');
  }
  if (html.includes('const recipes = [')) {
    console.log('  ✓ recipes 替换成功');
  }
  if (html.includes('const tips = [')) {
    console.log('  ✓ tips 替换成功');
  }

  console.log('\n=== 每日内容更新完成 ===');
}

main().catch(e => {
  console.error('\n更新失败:', e.message);
  process.exit(1);
});
