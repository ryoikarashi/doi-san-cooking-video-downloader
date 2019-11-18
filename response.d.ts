export type YappliResponse = {
    feed: {
        author: Array<any>;
        category: Array<any>;
        entry: Array<Entry>;
        id: string;
        title: string;
        updated: string;
    };
};

export type Entry = {
    category: Array<any>;
    id: string;
    summary: string;
    updated: string;
    content: {
        _src: string;
        _type: string;
    };
    link: Array<{
        _href: string,
        _type: string;
    }>;
    title: string;
};
