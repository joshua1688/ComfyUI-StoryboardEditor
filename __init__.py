__version__ = "1.0.0"
__author__ = "joshua1688"

from .storyboard_editor import StoryboardEditor

NODE_CLASS_MAPPINGS = {
    "StoryboardEditor": StoryboardEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "StoryboardEditor": "分镜编辑器",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]