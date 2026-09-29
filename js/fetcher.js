// 메인 룬 데이터 불러오기 (data/rune-m.json)
async function fetchMainRunes() {
    try {
        const res = await fetch('data/rune-m.json');
        if (!res.ok) throw new Error('메인 룬 데이터를 불러올 수 없습니다.');
        const data = await res.json();
        // 도감/필터에서 구분할 수 있도록 type을 'main'으로 통일
        return data.map(rune => ({...rune, type: 'main' }));
    } catch (err) {
        console.error(err);
        return [];
    }
}

// 서브 룬 데이터 불러오기 (data/rune-s.json)
async function fetchSubRunes() {
    try {
        const res = await fetch('data/rune-s.json');
        if (!res.ok) throw new Error('서브 룬 데이터를 불러올 수 없습니다.');
        const data = await res.json();
        // id가 비어있는 더미/플레이스홀더 데이터는 제외하고,
        // type을 'sub'로 통일
        return data
            .filter(rune => rune.id)
            .map(rune => ({...rune, type: 'sub' }));
    } catch (err) {
        console.error(err);
        return [];
    }
}

// 메인 + 서브 룬을 한 번에 불러오기 (룬 도감 "전체" 탭에서 사용)
async function fetchAllRunes() {
    const [mainRunes, subRunes] = await Promise.all([
        fetchMainRunes(),
        fetchSubRunes()
    ]);
    return [...mainRunes, ...subRunes];
}