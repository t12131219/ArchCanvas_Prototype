from torch import nn


class Assembly(nn.Module):
    def __init__(self, core):
        self.core = core
        self.alias = core
        self.act = nn.GELU()

    def __call__(self, x):
        return self.alias(self.act(self.core(x)))
