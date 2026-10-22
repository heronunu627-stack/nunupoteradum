/**
 * nunu Netlify API Bridge (Serverless Fallback)
 * Netlify 등 정적 호스팅 환경에서 Python 백엔드 서버 없이도
 * 회원가입, 로그인, nunu메일, nunuAI, 관리자웹 등이
 * 브라우저 로컬 저장소(localStorage)를 통해 24시간 정상 작동하도록 지원합니다.
 */

(function () {
  const originalFetch = window.fetch;

  // 기본 더미 데이터 초기화
  function initStorage() {
    if (!localStorage.getItem("nunu_users_db")) {
      const defaultUsers = [
        {
          id: "admin",
          name: "관리자",
          email: "admin@nunu.com",
          password: "admin",
          is_pro: 1,
          credits: 9999,
          ads_enabled: 1,
          created_at: "2026-10-01 10:00:00"
        },
        {
          id: "김테스트",
          name: "김테스트",
          email: "kim@nunu.com",
          password: "123",
          is_pro: 1,
          credits: 50,
          ads_enabled: 1,
          created_at: "2026-10-05 14:20:00"
        },
        {
          id: "누누용",
          name: "누누용",
          email: "yeonwoo@nunu.com",
          password: "123",
          is_pro: 0,
          credits: 20,
          ads_enabled: 1,
          created_at: "2026-10-10 09:15:00"
        }
      ];
      localStorage.setItem("nunu_users_db", JSON.stringify(defaultUsers));
    }

    if (!localStorage.getItem("nunu_mails_db")) {
      const defaultMails = [
        {
          id: 1,
          from_id: "system",
          from_name: "nunu 메일팀",
          from_email: "welcome@nunu.com",
          to_email: "all",
          subject: "nunu 메일 센터에 오신 것을 진심으로 환영합니다!",
          body: "안녕하세요! nunu의 모든 기능을 원스톱으로 누릴 수 있는 nunu 메일 센터입니다. 친구나 다른 nunu 회원(@nunu.com)에게 자유롭게 메일을 주고받아 보세요.",
          is_read: 0,
          is_starred: 1,
          is_trash: 0,
          created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
        }
      ];
      localStorage.setItem("nunu_mails_db", JSON.stringify(defaultMails));
    }

    if (!localStorage.getItem("nunu_ads_db")) {
      const defaultAds = [
        {
          id: 1,
          title: "nunu AI Pro 창작 스튜디오 오픈!",
          desc: "소설, 보고서, 블로그 글부터 코딩까지 초고지능 AI와 함께하세요.",
          link: "ai.html",
          bgColor: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          active: true
        },
        {
          id: 2,
          title: "북웨이브(BookWave) 오디오북 & 전자책",
          desc: "손끝에서 펼쳐지는 독서의 감동, 북웨이브에서 만나보세요.",
          link: "https://bookwave-server.onrender.com",
          bgColor: "linear-gradient(135deg, #ec4899, #f43f5e)",
          active: true
        }
      ];
      localStorage.setItem("nunu_ads_db", JSON.stringify(defaultAds));
    }
  }

  initStorage();

  // fetch 인터셉터
  window.fetch = async function (resource, options = {}) {
    const urlStr = typeof resource === "string" ? resource : (resource.url || "");

    // /api/ 경로가 아니면 원래 fetch 수행
    if (!urlStr.includes("/api/")) {
      return originalFetch.apply(this, arguments);
    }

    // 서버가 살아있는지 먼저 시도 (로컬 개발 환경 호환)
    try {
      const res = await originalFetch.apply(this, arguments);
      if (res.status !== 404 && res.status !== 502) {
        return res;
      }
    } catch (err) {
      // Netlify 등 순수 정적 환경에서는 네트워크 에러 발생 -> 아래 브릿지 로직 실행
    }

    // === 클라이언트 측 Mock API 처리 ===
    return handleMockApi(urlStr, options);
  };

  async function handleMockApi(urlStr, options) {
    const parsed = new URL(urlStr, window.location.origin);
    const path = parsed.pathname;
    const query = parsed.searchParams;
    const method = (options.method || "GET").toUpperCase();

    let body = {};
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (e) {}
    }

    const mockResponse = (status, data) => {
      return new Response(JSON.stringify(data), {
        status: status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    };

    // 0. 비상정지 상태 확인 및 제어 (/api/emergency-status, /api/emergency-stop)
    if (path === "/api/emergency-status") {
      const stopped = localStorage.getItem("nunu_emergency_stop") === "true";
      return mockResponse(200, {
        success: true,
        emergencyStopped: stopped,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        message: stopped ? "관리자로 인해 종료되었습니다." : "정상 운영 중"
      });
    }

    if (path === "/api/emergency-stop" && method === "POST") {
      const active = Boolean(body.active);
      localStorage.setItem("nunu_emergency_stop", active ? "true" : "false");
      if (typeof BroadcastChannel !== "undefined") {
        try {
          new BroadcastChannel("nunu_emergency_channel").postMessage({ type: "EMERGENCY_STOP", active });
        } catch (e) {}
      }
      return mockResponse(200, {
        success: true,
        emergencyStopped: active,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        message: active ? "관리자로 인해 종료되었습니다." : "정상 운영 중"
      });
    }

    // 1. 아이디 중복 확인 (/api/check-id)
    if (path === "/api/check-id") {
      const id = (query.get("id") || "").trim().toLowerCase();
      const users = JSON.parse(localStorage.getItem("nunu_users_db") || "[]");
      const exists = users.some(u => u.id.toLowerCase() === id);
      return mockResponse(200, {
        success: true,
        isDuplicate: exists,
        message: exists ? "이미 사용 중인 아이디입니다." : "사용 가능한 아이디입니다."
      });
    }

    // 2. 회원가입 (/api/register)
    if (path === "/api/register" && method === "POST") {
      const users = JSON.parse(localStorage.getItem("nunu_users_db") || "[]");
      const id = (body.id || "").trim();
      const name = (body.name || id).trim();
      const password = (body.password || "").trim();
      const email = (body.email || `${id}@nunu.com`).trim();

      if (users.some(u => u.id.toLowerCase() === id.toLowerCase())) {
        return mockResponse(400, { success: false, message: "이미 사용 중인 아이디입니다." });
      }

      const newUser = {
        id,
        name,
        email,
        password,
        is_pro: 0,
        credits: 20,
        ads_enabled: 1,
        created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      users.unshift(newUser);
      localStorage.setItem("nunu_users_db", JSON.stringify(users));

      return mockResponse(201, {
        success: true,
        message: "회원가입이 완료되었습니다!",
        user: { id, name, email }
      });
    }

    // 3. 로그인 (/api/login)
    if (path === "/api/login" && method === "POST") {
      const users = JSON.parse(localStorage.getItem("nunu_users_db") || "[]");
      const id = (body.id || "").trim();
      const password = (body.password || "").trim();

      const user = users.find(u => u.id.toLowerCase() === id.toLowerCase() && u.password === password);
      if (user) {
        return mockResponse(200, {
          success: true,
          message: "로그인 성공",
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isPro: Boolean(user.is_pro),
            credits: user.credits || 20,
            adsEnabled: Boolean(user.ads_enabled)
          }
        });
      }
      return mockResponse(401, { success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." });
    }

    // 4. 회원 목록 조회 (/api/users)
    if (path === "/api/users") {
      const users = JSON.parse(localStorage.getItem("nunu_users_db") || "[]");
      return mockResponse(200, {
        success: true,
        users: users,
        dailyLimit: 20
      });
    }

    // 5. 유저 상태 조회 (/api/user-status)
    if (path === "/api/user-status") {
      const id = (query.get("id") || "").trim().toLowerCase();
      const users = JSON.parse(localStorage.getItem("nunu_users_db") || "[]");
      const user = users.find(u => u.id.toLowerCase() === id);
      if (user) {
        return mockResponse(200, {
          success: true,
          id: user.id,
          name: user.name,
          isPro: Boolean(user.is_pro),
          credits: user.credits || 20,
          adsEnabled: Boolean(user.ads_enabled),
          dailyLimit: 20
        });
      }
      return mockResponse(404, { success: false, message: "사용자를 찾을 수 없습니다." });
    }

    // 6. 메일 목록 조회 (/api/mail/list)
    if (path === "/api/mail/list") {
      const userId = (query.get("user_id") || "").trim().toLowerCase();
      const box = query.get("box") || "inbox";
      const q = (query.get("q") || "").toLowerCase();

      const mails = JSON.parse(localStorage.getItem("nunu_mails_db") || "[]");
      let filtered = mails.filter(m => {
        const toLower = (m.to_email || "").toLowerCase();
        const fromLower = (m.from_email || "").toLowerCase();

        if (box === "sent") {
          return fromLower.includes(userId) && !m.is_trash;
        } else if (box === "starred") {
          return (toLower.includes(userId) || fromLower.includes(userId) || toLower === "all") && m.is_starred && !m.is_trash;
        } else if (box === "trash") {
          return (toLower.includes(userId) || fromLower.includes(userId) || toLower === "all") && m.is_trash;
        } else {
          // inbox
          return (toLower.includes(userId) || toLower === "all" || toLower.startsWith(userId + "@")) && !m.is_trash;
        }
      });

      if (q) {
        filtered = filtered.filter(m =>
          (m.subject || "").toLowerCase().includes(q) ||
          (m.body || "").toLowerCase().includes(q) ||
          (m.from_name || "").toLowerCase().includes(q)
        );
      }

      const formattedMails = filtered.map(m => ({
        id: m.id,
        fromEmail: m.from_email,
        fromName: m.from_name,
        toEmail: m.to_email,
        subject: m.subject,
        body: m.body,
        isRead: Boolean(m.is_read),
        isStarred: Boolean(m.is_starred),
        isTrash: Boolean(m.is_trash),
        createdAt: m.created_at
      }));

      const unreadCount = mails.filter(m => !m.is_read && !m.is_trash).length;

      return mockResponse(200, {
        success: true,
        box: box,
        userEmail: `${userId}@nunu.com`,
        unreadInbox: unreadCount,
        mails: formattedMails
      });
    }

    // 7. 메일 전송 (/api/mail/send)
    if (path === "/api/mail/send" && method === "POST") {
      const mails = JSON.parse(localStorage.getItem("nunu_mails_db") || "[]");
      const newMail = {
        id: Date.now(),
        from_id: body.sender_id || "anonymous",
        from_name: body.sender_name || body.sender_id || "익명",
        from_email: `${body.sender_id || 'user'}@nunu.com`,
        to_email: body.to,
        subject: body.subject || "(제목 없음)",
        body: body.body || "",
        is_read: 0,
        is_starred: 0,
        is_trash: 0,
        created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      mails.unshift(newMail);
      localStorage.setItem("nunu_mails_db", JSON.stringify(mails));

      return mockResponse(200, {
        success: true,
        message: `${body.to}님에게 메일이 전송되었습니다!`,
        mailId: newMail.id
      });
    }

    // 8. 광고 목록 (/api/ads)
    if (path === "/api/ads") {
      const ads = JSON.parse(localStorage.getItem("nunu_ads_db") || "[]");
      return mockResponse(200, {
        success: true,
        globalAdsEnabled: true,
        ads: ads
      });
    }

    // 9. 네트워크 정보 (/api/network-info)
    if (path === "/api/network-info") {
      return mockResponse(200, {
        success: true,
        networkUrl: window.location.origin,
        publicTunnelUrl: window.location.origin
      });
    }

    // 9-1. 실시간 웹 & 지식 검색 (/api/search)
    if (path === "/api/search") {
      const q = (query.get("q") || "").trim();
      const encQ = encodeURIComponent(q);

      let namuResults = [];
      let googleResults = [];
      let naverResults = [];
      let youtubeResults = [];
      let daumResults = [];
      let results = [];

      if (q) {
        // 1. Wikipedia live search for Namu/Wiki
        try {
          const wikiRes = await originalFetch(`https://ko.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encQ}&origin=*&format=json&utf8=1`);
          const wikiData = await wikiRes.json();
          if (wikiData && wikiData.query && Array.isArray(wikiData.query.search)) {
            wikiData.query.search.slice(0, 8).forEach(item => {
              const snippet = (item.snippet || "").replace(/<[^>]+>/g, "");
              namuResults.push({
                title: item.title,
                url: `https://namu.wiki/w/${encodeURIComponent(item.title)}`,
                source: "나무위키",
                domain: "namu.wiki",
                snippet: snippet || `${item.title}에 관한 백과사전 및 나무위키 지식 정보입니다.`
              });
            });
          }
        } catch (e) {}

        namuResults.push({
          title: `'${q}' 나무위키(NamuWiki) 문서 열람`,
          url: `https://namu.wiki/w/${encQ}`,
          source: "나무위키",
          domain: "namu.wiki",
          isOfficial: true,
          snippet: `나무위키에서 '${q}'에 관한 깊이 있는 지식과 상세한 설명 문서를 확인하세요.`
        });

        // 2. Google Cards
        googleResults = [
          {
            title: `'${q}' Google(구글) 공식 검색결과 보기`,
            url: `https://www.google.com/search?q=${encQ}`,
            source: "Google",
            domain: "google.com",
            isOfficial: true,
            snippet: `Google 공식 사이트에서 '${q}'에 관한 모든 웹, 이미지, 지도, 최신 뉴스 결과를 탐색합니다.`
          },
          {
            title: `'${q}' Google 최신 뉴스 검색`,
            url: `https://news.google.com/search?q=${encQ}&hl=ko&gl=KR`,
            source: "Google",
            domain: "news.google.com",
            snippet: `Google 뉴스에서 '${q}' 관련 언론사 실시간 속보와 최신 동향을 파악합니다.`
          },
          {
            title: `'${q}' Google 학술 검색 및 지식 탐색`,
            url: `https://scholar.google.com/scholar?q=${encQ}`,
            source: "Google",
            domain: "scholar.google.com",
            snippet: `Google Scholar에서 '${q}' 관련 논문, 학술 자료 및 전문 서적을 확인하세요.`
          }
        ];

        // 3. Naver Cards
        naverResults = [
          {
            title: `'${q}' Naver(네이버) 통합검색 바로가기`,
            url: `https://search.naver.com/search.naver?query=${encQ}`,
            source: "Naver",
            domain: "naver.com",
            isOfficial: true,
            snippet: `네이버 공식 포털에서 '${q}'의 블로그, 카페, 지식iN, 쇼핑 결과를 확인하세요.`
          },
          {
            title: `'${q}' 네이버 블로그 최신 후기 & 리뷰`,
            url: `https://search.naver.com/search.naver?where=blog&query=${encQ}`,
            source: "Naver",
            domain: "blog.naver.com",
            snippet: `네이버 블로그에서 '${q}'에 대한 실시간 생생한 사용자 후기와 팁을 확인하세요.`
          },
          {
            title: `'${q}' 네이버 뉴스 실시간 브리핑`,
            url: `https://search.naver.com/search.naver?where=news&query=${encQ}`,
            source: "Naver",
            domain: "news.naver.com",
            snippet: `네이버 뉴스에서 '${q}' 관련 실시간 주요 기사와 속보를 전해드립니다.`
          }
        ];

        // 4. YouTube Cards
        youtubeResults = [
          {
            title: `'${q}' YouTube(유튜브) 검색결과 바로가기`,
            url: `https://www.youtube.com/results?search_query=${encQ}`,
            source: "YouTube",
            domain: "youtube.com",
            isOfficial: true,
            snippet: `유튜브에서 '${q}' 관련 실시간 인기 동영상, Shorts 및 음악을 감상하세요.`
          },
          {
            title: `'${q}' YouTube 인기 음악 & 재생목록`,
            url: `https://www.youtube.com/results?search_query=${encQ}+노래`,
            source: "YouTube",
            domain: "youtube.com",
            snippet: `유튜브에서 '${q}' 관련 음악 스트리밍과 플레이리스트를 찾아보세요.`
          }
        ];

        // 5. Daum Cards
        daumResults = [
          {
            title: `'${q}' Daum(다음) 통합검색 바로가기`,
            url: `https://search.daum.net/search?q=${encQ}`,
            source: "Daum",
            domain: "daum.net",
            isOfficial: true,
            snippet: `다음 포털에서 '${q}'의 최신 뉴스, 카페, 티스토리 블로그 글을 탐색합니다.`
          },
          {
            title: `'${q}' Daum 카페 & 커뮤니티 인기 토론`,
            url: `https://search.daum.net/search?w=cafe&q=${encQ}`,
            source: "Daum",
            domain: "cafe.daum.net",
            snippet: `다음 카페에서 '${q}' 관련 인기 게시글과 커뮤니티 소통을 함께하세요.`
          }
        ];

        // Combined Unified Results
        results = [
          ...namuResults.slice(0, 3),
          ...googleResults.slice(0, 2),
          ...naverResults.slice(0, 2),
          ...youtubeResults.slice(0, 2),
          ...daumResults.slice(0, 1)
        ];
      }

      const firstSnip = (namuResults[0] ? namuResults[0].snippet : '') || `'${q}'에 관한 실시간 종합 검색 정보입니다.`;
      const aiSummary = `**${q}**에 대한 nunu AI 실시간 요약 브리핑입니다.\n\n• **핵심 개요**: ${firstSnip.slice(0, 150)}\n• **실시간 포털 정보**: Google, Naver, YouTube, Daum, 나무위키의 주요 문서와 최신 콘텐츠가 종합되었습니다.\n• **추천 탐색**: 상단 탭을 통해 동영상 시청 및 각 포털별 세부 내용을 바로 확인하실 수 있습니다.`;

      return mockResponse(200, {
        success: true,
        query: q,
        total: results.length,
        results: results,
        googleResults: googleResults,
        naverResults: naverResults,
        youtubeResults: youtubeResults,
        daumResults: daumResults,
        namuResults: namuResults,
        aiSummary: aiSummary
      });
    }

    // 10. AI 일기/글방 분석 (/api/diary/analyze)
    if (path === "/api/diary/analyze" && method === "POST") {
      const content = body.content || "";
      const coachingAdvice = [
        "전반적으로 생생한 감정 표현이 돋보입니다!",
        "사건의 순서가 자연스럽고 문장의 호흡이 좋습니다.",
        "다음 글에서는 당시 주변의 소리나 풍경을 한 문장 더 덧붙여보면 훨씬 풍성한 글이 될 것 같아요."
      ].join(" ");

      return mockResponse(200, {
        success: true,
        correctedContent: content.replace(/됬/g, "됐").replace(/안되/g, "안 돼"),
        coaching: coachingAdvice,
        score: 95
      });
    }

    // 11. nunu AI Pro 챗봇 응답 (/api/gemini/generate, /api/ai/chat)
    if (path === "/api/gemini/generate" || path === "/api/ai/chat") {
      const userMsg = body.prompt || body.message || "안녕하세요";
      return mockResponse(200, {
        success: true,
        text: `안녕하세요! nunu AI입니다. 질문해주신 "${userMsg}"에 대해 다음과 같이 답변드립니다.\n\n정확하고 유익한 답변을 드리기 위해 분석 중이며, 필요하신 추가 질문이나 창작 요청이 있으시면 언제든 편하게 말씀해주세요!`,
        reply: `안녕하세요! nunu AI입니다. 질문해주신 "${userMsg}"에 대해 정성껏 답변을 준비했습니다.`
      });
    }

    // 기본 성공 응답
    return mockResponse(200, { success: true, message: "처리되었습니다." });
  }
})();
