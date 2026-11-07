import type { FileContent, ImageContent, MessageContent } from '@olegpolyakov/backend/features/ai';
import { FileService } from '@olegpolyakov/backend/features/files';
import { isEntityRef, type Ref } from '@olegpolyakov/core/objects/ref';

export default class RefService {
    constructor(private filesApiUrl: string) {}

    async resolve(refs: Ref[], accessToken: string): Promise<MessageContent[]> {
        const fileService = new FileService(this.filesApiUrl, accessToken);

        const promises = refs.map(async ref => {
            if (isEntityRef(ref)) {
                const file = await fileService.get(ref.id);
                const url = await fileService.getUrl(ref.id);
        
                if (file.type.startsWith('image')) {
                    return {
                        type: 'image',
                        url
                    } as ImageContent;
                } else {
                    return {
                        type: 'file',
                        url
                    } as FileContent;
                }
            }
        });
        
        const resolved = await Promise.all(promises);
        
        return resolved.filter(i => !!i);
    }
}