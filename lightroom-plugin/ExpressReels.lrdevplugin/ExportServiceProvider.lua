local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'
local LrFileUtils = import 'LrFileUtils'
local LrPathUtils = import 'LrPathUtils'

local exportServiceProvider = {}

exportServiceProvider.hideSections = { 'exportLocation' }

function exportServiceProvider.processRenderedPhotos( functionContext, exportContext )
    local exportSession = exportContext.exportSession
    local nPhotos = exportSession:countRenditions()

    local progressScope = exportContext:configureProgress {
        title = nPhotos > 1 and ("Exporting " .. nPhotos .. " photos to Express Reels") or "Exporting to Express Reels",
    }

    local exportedPaths = {}

    for i, rendition in exportContext:renditions {
        local success, pathOrMessage = rendition:waitForRender()

        if progressScope:isCanceled() then
            break
        end

        if success then
            table.insert(exportedPaths, pathOrMessage)
        else
            LrDialogs.message("Export Failed", "Failed to render a photo.", "critical")
        end

        progressScope:setPortionComplete(i, nPhotos)
    end

    if #exportedPaths > 0 then
        -- Ideally, we launch the Express Reels application with the exported paths.
        -- For this MVP, we just notify the user that the images are ready.
        LrDialogs.message("Export to Express Reels", "Successfully exported " .. #exportedPaths .. " images. You can now drag them into the Express Reels Stills Workspace.", "info")
    end
end

return exportServiceProvider
