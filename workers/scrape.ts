import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

export interface IndexCheckResult {
    url: string;
    status: 'INDEXED' | 'NOT_INDEXED' | 'ERROR';
    checkedAt: Date;
    resultCount?: number;
    errorMessage?: string;
    htmlContent?: string;
}

// Extract domain and path from the target URL
const buildGoogleSearchQuery = (url: string): string => {
    const urlObj = new URL(url);
    const domain: string = urlObj.hostname;
    const urlPath: string = urlObj.pathname + urlObj.search;
    
    return `site:${domain} inurl:${urlPath}`;
};

// Check if URL is indexed by parsing Google search results
const checkIndexStatus = (htmlResponse: string, targetUrl: string): Omit<IndexCheckResult, 'htmlContent'> => {
    const checkedAt = new Date();
    
    try {
        // Look for common "no results" indicators in Google's HTML
        const noResultsIndicators = [
            'did not match any documents',
            'No results found',
            'did not match any',
            'Your search.*did not match'
        ];
        
        const hasNoResults = noResultsIndicators.some(indicator => 
            new RegExp(indicator, 'i').test(htmlResponse)
        );
        
        if (hasNoResults) {
            return {
                url: targetUrl,
                status: 'NOT_INDEXED',
                checkedAt,
                resultCount: 0
            };
        }
        
        // Check if the target URL appears in the search results
        // Google typically includes URLs in href attributes and visible text
        const urlPattern = targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isUrlFound = new RegExp(urlPattern, 'i').test(htmlResponse);
        
        // Also check for the domain and path separately
        const urlObj = new URL(targetUrl);
        const domainFound = htmlResponse.includes(urlObj.hostname);
        const pathFound = htmlResponse.includes(urlObj.pathname);
        
        if (isUrlFound || (domainFound && pathFound)) {
            return {
                url: targetUrl,
                status: 'INDEXED',
                checkedAt
            };
        }
        
        return {
            url: targetUrl,
            status: 'NOT_INDEXED',
            checkedAt
        };
        
    } catch (error) {
        return {
            url: targetUrl,
            status: 'ERROR',
            checkedAt,
            errorMessage: error instanceof Error ? error.message : 'Unknown error during parsing'
        };
    }
};

/**
 * Check if a URL is indexed on Google using scrape.do API
 * @param url - The URL to check for indexing
 * @param apiToken - The scrape.do API token (defaults to env variable)
 * @returns Promise with IndexCheckResult
 */
export async function checkUrlIndexing(
    url: string, 
    apiToken: string = process.env.SCRAPEDO_API_KEY!
): Promise<IndexCheckResult> {
    try {
        const googleSearchQuery: string = buildGoogleSearchQuery(url);
        const googleSearchUrl: string = `https://www.google.com/search?q=${encodeURIComponent(googleSearchQuery)}`;
        const targetUrl: string = encodeURIComponent(googleSearchUrl);

        const config: AxiosRequestConfig = {
            method: 'GET',
            url: `https://api.scrape.do/?token=${apiToken}&url=${targetUrl}`,
            headers: {}
        };

        const response: AxiosResponse = await axios(config);

        // Check indexing status
        const htmlContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const result = checkIndexStatus(htmlContent, url);

        return {
            ...result,
            htmlContent
        };
        
    } catch (error) {
        return {
            url,
            status: 'ERROR',
            checkedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'API request failed'
        };
    }
}