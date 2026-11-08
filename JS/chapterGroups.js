export function groupChaptersByNumber(chapters) {
    const groups = new Map();
    for (const [index, chapter] of chapters.entries()) {
        const number = Number.isInteger(chapter?.number) && chapter.number > 0
            ? chapter.number
            : index + 1;
        const versions = groups.get(number) || [];
        versions.push({ chapter, index });
        groups.set(number, versions);
    }
    return groups;
}
