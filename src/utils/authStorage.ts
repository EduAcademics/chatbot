
export interface AuthParams {
    token?: string;
    branch_token?: string;
    academic_session?: string;
}

export const extractAuthFromURL = (): AuthParams => {
    const params = new URLSearchParams(window.location.search);

    return {
        token: params.get('token') || undefined,
        branch_token: params.get('branch_token') || undefined,
        academic_session: params.get('academic_session') || undefined,
    };
};

export const syncAuthFromURL = (): boolean => {
    const authParams = extractAuthFromURL();
    let synced = false;

    if (authParams.token) {
        localStorage.setItem('token', authParams.token);
        synced = true;
    }
    if (authParams.branch_token) {
        localStorage.setItem('branch_token', authParams.branch_token);
        synced = true;
    }
    if (authParams.academic_session) {
        localStorage.setItem('academic_session', authParams.academic_session);
        synced = true;
    }

    return synced;
};

export const cleanAuthFromURL = (): void => {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    let hasAuthParams = false;

    if (params.has('token')) {
        params.delete('token');
        hasAuthParams = true;
    }

    if (params.has('branch_token')) {
        params.delete('branch_token');
        hasAuthParams = true;
    }

    if (params.has('academic_session')) {
        params.delete('academic_session');
        hasAuthParams = true;
    }
    if (hasAuthParams) {
        const newUrl = params.toString()
            ? `${url.pathname}?${params.toString()}`
            : url.pathname;

        window.history.replaceState({}, document.title, newUrl);
    }
};

export const getAuthValues = (): AuthParams => {
    return {
        token: localStorage.getItem('token') || undefined,
        branch_token: localStorage.getItem('branch_token') || undefined,
        academic_session: localStorage.getItem('academic_session') || undefined,
    };
};

export const isAuthenticated = (): boolean => {
    return !!localStorage.getItem('token');
};



